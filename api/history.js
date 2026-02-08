import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        const REDIS_URL = process.env.REDIS_URL;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!REDIS_URL) {
            return response.status(200).json({
                history: []
            });
        }

        // 1. 사용자 인증
        const authHeader = request.headers.authorization;
        let userId = null;

        if (authHeader) {
            const token = authHeader.split(' ')[1];
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
                error: '로그인이 필요합니다.'
            });
        }

        const client = new Redis(REDIS_URL);

        // 2. 해당 사용자의 일기 키만 가져오기
        const keys = await client.keys(`user:${userId}:diary-*`);

        if (keys.length === 0) {
            await client.quit();
            return response.status(200).json({
                history: []
            });
        }

        // 3. 키에 해당하는 모든 값 가져오기
        const values = await client.mget(keys);

        // 4. 데이터 파싱 및 가공
        const history = values
            .map(value => {
                if (!value) return null;
                try {
                    return JSON.parse(value);
                } catch (e) {
                    console.error('JSON Parse Error:', e);
                    return null;
                }
            })
            .filter(item => item !== null) // 파싱 실패하거나 빈 값 제거
            .sort((a, b) => {
                // 5. 최신순 정렬 (createdAt 기준 내림차순)
                return new Date(b.createdAt) - new Date(a.createdAt);
            });

        await client.quit();

        return response.status(200).json({
            history
        });
    } catch (error) {
        console.error('History API Error:', error);
        return response.status(500).json({
            error: '일기 히스토리를 불러오는 중 오류가 발생했습니다.'
        });
    }
}
