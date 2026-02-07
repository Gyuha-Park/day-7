import Redis from 'ioredis';

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

        if (!GEMINI_API_KEY) {
            return response.status(500).json({
                error: 'API 키가 서버에 설정되지 않았습니다.'
            });
        }

        // 4. Gemini API 호출
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
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

        // 5. AI 답변 추출
        const aiMessage = data.candidates[0].content.parts[0].text;

        // 6. Redis에 저장
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

                const key = `diary-${timestamp}`;

                const value = JSON.stringify({
                    content,
                    aiMessage,
                    createdAt: now.toISOString()
                });

                await client.set(key, value);

                // Serverless 환경에서는 연결을 명시적으로 끊어주어야 함수가 종료될 수 있음 (상황에 따라 다름)
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
