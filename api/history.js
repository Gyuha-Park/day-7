import Redis from 'ioredis';

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({
            error: 'Method Not Allowed'
        });
    }

    try {
        const REDIS_URL = process.env.REDIS_URL;

        if (!REDIS_URL) {
            // Redis가 설정되지 않았을 때는 빈 배열 반환 (에러보다는 정상적인 빈 상태로 처리)
            return response.status(200).json({
                history: []
            });
        }

        const client = new Redis(REDIS_URL);

        // 1. 모든 일기 키 가져오기
        const keys = await client.keys('diary-*');

        if (keys.length === 0) {
            await client.quit();
            return response.status(200).json({
                history: []
            });
        }

        // 2. 키에 해당하는 모든 값 가져오기
        const values = await client.mget(keys);

        // 3. 데이터 파싱 및 가공
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
                // 4. 최신순 정렬 (createdAt 기준 내림차순)
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
