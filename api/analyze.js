import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
    // 1. POST 요청만 허용
    if (request.method !== 'POST') {
        return response.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        // 2. 요청 바디에서 content(일기 내용) 추출
        const { content } = request.body;

        if (!content) {
            return response.status(400).json({
                error: '일기 내용을 입력해주세요.'
            });
        }

        // 3. 환경 변수에서 API 키 가져오기
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        const REDIS_URL = process.env.REDIS_URL;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!GEMINI_API_KEY) {
            return response.status(500).json({
                error: 'API 키가 서버에 설정되지 않았습니다.'
            });
        }

        // 4. 사용자 인증 (Supabase Token 검증)
        const authHeader = request.headers.authorization;
        let userId = null;

        if (authHeader) {
            const token = authHeader.split(' ')[1]; // Bearer <token>

            if (token && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
                const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                const { data: { user }, error } = await supabase.auth.getUser(token);

                if (!error && user) {
                    userId = user.id;
                }
            }
        }

        if (!userId) {
            return response.status(401).json({
                error: '로그인이 필요한 서비스입니다.'
            });
        }

        // 5. Gemini API 호출
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: `너는 심리 상담가야. 사용자가 작성한 일기 내용을 읽고, 사용자의 감정을 한 단어(예: 기쁨, 슬픔, 분노, 불안, 평온)로 요약해줘. 그리고 그 감정에 공감해주고, 따뜻한 응원의 메시지를 2~3문장으로 작성해줘. 답변 형식은 반드시 '감정: [요약된 감정]\n\n[응원 메시지]' 와 같이 줄바꿈을 포함해서 보내줘. 일기 내용: "${content}"`,
                                },
                            ],
                        },
                    ],
                }),
            }
        );

        const data = await geminiResponse.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        // AI 모델 응답 구조가 변경될 수 있으므로 안전하게 접근
        const aiMessage = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiMessage) {
            throw new Error('AI 응답을 분석할 수 없습니다.');
        }

        // 6. Redis에 저장 (사용자 ID 포함)
        if (REDIS_URL) {
            try {
                const client = new Redis(REDIS_URL);

                // 현재 시간을 YYYYMMDDHHMMSS 형식으로 포맷팅
                const now = new Date();
                const timestamp = now.getFullYear().toString() +
                    (now.getMonth() + 1).toString().padStart(2, '0') +
                    now.getDate().toString().padStart(2, '0') +
                    now.getHours().toString().padStart(2, '0') +
                    now.getMinutes().toString().padStart(2, '0') +
                    now.getSeconds().toString().padStart(2, '0');

                // 사용자별 키 생성: user:[userID]:diary-[timestamp]
                const key = `user:${userId}:diary-${timestamp}`;

                const value = JSON.stringify({
                    content,
                    aiMessage,
                    createdAt: now.toISOString(),
                    userId // 저장 데이터에도 포함 (선택적)
                });

                await client.set(key, value);

                // 만료 시간 설정 (예: 30일) - 선택 사항이지만 Redis 용량 관리를 위해 권장
                await client.expire(key, 60 * 60 * 24 * 30);

                await client.quit();
            } catch (redisError) {
                console.error('Redis 저장 중 오류 발생:', redisError);
                // Redis 저장이 실패하더라도 사용자에게는 AI 답변을 정상적으로 반환해야 함
            }
        }

        // 7. 결과 반환
        return response.status(200).json({
            success: true,
            analysis: aiMessage,
        });
    } catch (error) {
        console.error('Serverless Function Error:', error);
        return response.status(500).json({
            error: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        });
    }
}
