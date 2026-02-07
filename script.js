document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyze-btn');
    const diaryInput = document.getElementById('diary-input');
    const responseBox = document.getElementById('ai-response-box');
    const responseText = document.getElementById('response-text');
    const voiceBtn = document.getElementById('voice-btn');

    // 1. 로컬 스토리지에서 이전 기록 불러오기
    const loadSavedData = () => {
        const savedDiary = localStorage.getItem('last_diary');
        const savedResponse = localStorage.getItem('last_ai_response');

        if (savedDiary) {
            diaryInput.value = savedDiary;
        }

        if (savedResponse) {
            responseText.textContent = savedResponse;
            responseText.style.fontStyle = 'normal';
            responseText.style.color = '#f8fafc';
        }
    };

    loadSavedData();

    analyzeBtn.addEventListener('click', async () => {
        const text = diaryInput.value.trim();

        if (!text) {
            alert('먼저 일기를 작성해주세요!');
            return;
        }

        // UI State: Loading
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<span class="icon">⏳</span> 분석 중...';
        responseText.textContent = 'AI가 당신의 이야기를 읽고 답변을 준비하고 있어요...';
        responseText.style.fontStyle = 'italic';
        responseText.style.color = 'var(--text-muted)';

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: text })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || '서버 응답 오류가 발생했습니다.');
            }

            const aiMessage = data.analysis;

            // UI State: Success
            responseText.textContent = aiMessage;
            responseText.style.fontStyle = 'normal';
            responseText.style.color = '#f8fafc';

            // 2. 새로운 기록 로컬 스토리지에 저장
            localStorage.setItem('last_diary', text);
            localStorage.setItem('last_ai_response', aiMessage);

        } catch (error) {
            console.error('API Error:', error);
            responseText.textContent = error.message.includes('API 키')
                ? '서버 설정 오류입니다. 관리자에게 문의하세요.'
                : '죄송합니다. 답변을 가져오는 중에 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<span class="icon">✨</span> 분석 요청하기';
        }
    });

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'ko-KR'; // 한국어 설정
        recognition.continuous = false; // 한 문장씩 인식 (필요시 true로 변경 가능)
        recognition.interimResults = false;

        recognition.onstart = () => {
            voiceBtn.classList.add('recording');
            voiceBtn.innerHTML = '<span class="icon">🔴</span> 음성 인식 중...';
        };

        recognition.onend = () => {
            voiceBtn.classList.remove('recording');
            voiceBtn.innerHTML = '<span class="icon">🎙️</span> 음성으로 입력하기';
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            diaryInput.value += (diaryInput.value ? ' ' : '') + transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                alert('마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해주세요.');
            } else {
                alert('음성 인식 중 오류가 발생했습니다: ' + event.error);
            }
        };
    }

    voiceBtn.addEventListener('click', () => {
        if (!recognition) {
            alert('이 브라우저는 음성 인식을 지원하지 않습니다. 크롬 브라우저 사용을 권장합니다.');
            return;
        }

        try {
            recognition.start();
        } catch (e) {
            // 이미 실행 중인 경우 등 예외 처리
            recognition.stop();
        }
    });

    // Simple interaction feedback
    diaryInput.addEventListener('focus', () => {
        diaryInput.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    });

    diaryInput.addEventListener('blur', () => {
        diaryInput.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    });
    // History Loading
    const historyList = document.getElementById('history-list');

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    const createHistoryCard = (item) => {
        const card = document.createElement('div');
        card.className = 'history-card';

        card.innerHTML = `
            <div class="card-header">
                <span class="date">${formatDate(item.createdAt)}</span>
            </div>
            <div class="card-body">
                <div class="diary-content">
                    <p>${item.content}</p>
                </div>
                <div class="ai-content">
                    <span class="ai-label">AI의 답변</span>
                    <p>${item.aiMessage.replace(/\n/g, '<br>')}</p>
                </div>
            </div>
        `;
        return card;
    };

    const fetchHistory = async () => {
        try {
            const response = await fetch('/api/history');
            const data = await response.json();

            if (data.history && data.history.length > 0) {
                historyList.innerHTML = ''; // Clear loading message
                data.history.forEach(item => {
                    const card = createHistoryCard(item);
                    historyList.appendChild(card);
                });
            } else {
                historyList.innerHTML = '<p class="empty-message">아직 기록된 일기가 없습니다. 첫 일기를 작성해보세요!</p>';
            }
        } catch (error) {
            console.error('History fetch error:', error);
            historyList.innerHTML = '<p class="error-message">히스토리를 불러오지 못했습니다.</p>';
        }
    };

    // Load history on start
    fetchHistory();
});
