// YouTube Quiz Generator Extension
class YouTubeQuizGenerator {
    constructor() {
        this.backendUrl = 'http://localhost:8000';
        this.currentVideo = null;
        this.selectedDifficulty = 'easy';
        this.quizData = null;
        this.userAnswers = {};
        
        this.initializeEventListeners();
        this.loadVideoInfo();
    }

    initializeEventListeners() {
        // Difficulty selector
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedDifficulty = e.target.dataset.difficulty;
            });
        });

        // Action buttons
        document.getElementById('generateQuizBtn').addEventListener('click', () => this.generateQuiz());
        document.getElementById('generateSummaryBtn').addEventListener('click', () => this.generateSummary());
        document.getElementById('extractTopicsBtn').addEventListener('click', () => this.extractTopics());
        document.getElementById('startChatBtn').addEventListener('click', () => this.startChat());
        document.getElementById('submitQuizBtn').addEventListener('click', () => this.submitQuiz());

        // Chat functionality
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }

    async loadVideoInfo() {
        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.showError('Unable to access current tab');
                return;
            }

            // Check if we're on a YouTube video page
            if (!this.isYouTubeVideoPage(tab.url)) {
                this.showError('Please navigate to a YouTube video page to use this extension');
                this.disableControls();
                return;
            }

            // Extract video information
            const videoInfo = this.extractVideoInfo(tab.url, tab.title);
            
            if (!videoInfo) {
                this.showError('Unable to extract video information');
                return;
            }

            this.currentVideo = videoInfo;
            this.updateVideoInfo(videoInfo);
            this.showSuccess('Video detected successfully!');

        } catch (error) {
            console.error('Error loading video info:', error);
            this.showError('Error loading video information: ' + error.message);
        }
    }

    isYouTubeVideoPage(url) {
        if (!url) return false;
        
        try {
            const urlObj = new URL(url);
            return urlObj.hostname === 'www.youtube.com' && 
                   urlObj.pathname === '/watch' && 
                   urlObj.searchParams.has('v');
        } catch (error) {
            return false;
        }
    }

    extractVideoInfo(url, title) {
        try {
            const urlObj = new URL(url);
            const videoId = urlObj.searchParams.get('v');
            
            if (!videoId) {
                return null;
            }

            // Clean up the title (remove " - YouTube" suffix)
            const cleanTitle = title.replace(/\s*-\s*YouTube$/, '');

            return {
                videoId: videoId,
                videoUrl: url,
                title: cleanTitle,
                fullUrl: url
            };
        } catch (error) {
            console.error('Error extracting video info:', error);
            return null;
        }
    }

    updateVideoInfo(videoInfo) {
        document.getElementById('videoTitle').textContent = videoInfo.title;
        document.getElementById('videoUrl').textContent = videoInfo.videoUrl;
    }

    disableControls() {
        const buttons = document.querySelectorAll('.action-btn');
        buttons.forEach(btn => btn.disabled = true);
    }

    enableControls() {
        const buttons = document.querySelectorAll('.action-btn');
        buttons.forEach(btn => btn.disabled = false);
    }

    showLoading(show = true) {
        const loading = document.getElementById('loading');
        const controls = document.querySelector('.controls');
        
        if (show) {
            loading.style.display = 'block';
            controls.style.opacity = '0.5';
            controls.style.pointerEvents = 'none';
        } else {
            loading.style.display = 'none';
            controls.style.opacity = '1';
            controls.style.pointerEvents = 'auto';
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Hide success message if shown
        document.getElementById('successMessage').style.display = 'none';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    showSuccess(message) {
        const successDiv = document.getElementById('successMessage');
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        
        // Hide error message if shown
        document.getElementById('errorMessage').style.display = 'none';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }

    async makeApiCall(endpoint, data = null) {
        try {
            const url = `${this.backendUrl}${endpoint}`;
            const options = {
                method: data ? 'POST' : 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw new Error(`Failed to connect to backend: ${error.message}`);
        }
    }

    async generateQuiz() {
        if (!this.currentVideo) {
            this.showError('No video detected');
            return;
        }

        this.showLoading(true);
        
        try {
            const response = await this.makeApiCall('/generate-quiz', {
                video_id: this.currentVideo.videoId,
                video_url: this.currentVideo.videoUrl,
                difficulty: this.selectedDifficulty,
                num_questions: 5
            });

            this.quizData = response;
            this.displayQuiz(response);
            this.showSuccess('Quiz generated successfully!');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displayQuiz(quizData) {
        const quizContent = document.getElementById('quizContent');
        const quizSection = document.getElementById('quizSection');
        
        quizContent.innerHTML = '';
        this.userAnswers = {};

        quizData.questions.forEach((question, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            
            const questionText = document.createElement('div');
            questionText.className = 'question-text';
            questionText.textContent = `${index + 1}. ${question.question}`;
            
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            
            question.options.forEach((option, optionIndex) => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'option';
                optionDiv.textContent = option;
                optionDiv.dataset.questionIndex = index;
                optionDiv.dataset.optionIndex = optionIndex;
                
                optionDiv.addEventListener('click', () => {
                    // Remove previous selection for this question
                    questionDiv.querySelectorAll('.option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    
                    // Select this option
                    optionDiv.classList.add('selected');
                    this.userAnswers[index] = optionIndex;
                });
                
                optionsDiv.appendChild(optionDiv);
            });
            
            questionDiv.appendChild(questionText);
            questionDiv.appendChild(optionsDiv);
            quizContent.appendChild(questionDiv);
        });

        // Show quiz section
        document.getElementById('results').style.display = 'block';
        quizSection.style.display = 'block';
        
        // Hide other sections
        document.getElementById('summarySection').style.display = 'none';
        document.getElementById('topicsSection').style.display = 'none';
        document.getElementById('chatSection').style.display = 'none';
    }

    async submitQuiz() {
        if (!this.quizData || Object.keys(this.userAnswers).length === 0) {
            this.showError('Please answer at least one question before submitting');
            return;
        }

        this.showLoading(true);
        
        try {
            const response = await this.makeApiCall('/verify-answers', {
                video_id: this.currentVideo.videoId,
                video_url: this.currentVideo.videoUrl,
                user_answers: this.userAnswers,
                quiz_data: this.quizData
            });

            this.displayQuizResults(response);
            this.showSuccess('Quiz submitted successfully!');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displayQuizResults(results) {
        const questions = document.querySelectorAll('.question');
        
        questions.forEach((question, index) => {
            const options = question.querySelectorAll('.option');
            const correctAnswer = this.quizData.questions[index].correct_answer;
            const userAnswer = this.userAnswers[index];
            
            options.forEach((option, optionIndex) => {
                option.style.pointerEvents = 'none'; // Disable further clicks
                
                if (optionIndex === correctAnswer) {
                    option.classList.add('correct');
                } else if (optionIndex === userAnswer && userAnswer !== correctAnswer) {
                    option.classList.add('incorrect');
                }
            });
        });

        // Hide submit button
        document.getElementById('submitQuizBtn').style.display = 'none';
    }

    async generateSummary() {
        if (!this.currentVideo) {
            this.showError('No video detected');
            return;
        }

        this.showLoading(true);
        
        try {
            const response = await this.makeApiCall('/generate-summary', {
                video_id: this.currentVideo.videoId,
                video_url: this.currentVideo.videoUrl
            });

            this.displaySummary(response.summary);
            this.showSuccess('Summary generated successfully!');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displaySummary(summary) {
        document.getElementById('summaryContent').textContent = summary;
        
        // Show summary section
        document.getElementById('results').style.display = 'block';
        document.getElementById('summarySection').style.display = 'block';
        
        // Hide other sections
        document.getElementById('quizSection').style.display = 'none';
        document.getElementById('topicsSection').style.display = 'none';
        document.getElementById('chatSection').style.display = 'none';
    }

    async extractTopics() {
        if (!this.currentVideo) {
            this.showError('No video detected');
            return;
        }

        this.showLoading(true);
        
        try {
            const response = await this.makeApiCall('/generate-topics', {
                video_id: this.currentVideo.videoId,
                video_url: this.currentVideo.videoUrl
            });

            this.displayTopics(response.topics);
            this.showSuccess('Topics extracted successfully!');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displayTopics(topics) {
        const topicsContent = document.getElementById('topicsContent');
        topicsContent.innerHTML = '';
        
        topics.forEach(topic => {
            const topicDiv = document.createElement('div');
            topicDiv.style.marginBottom = '8px';
            topicDiv.innerHTML = `
                <strong>${topic.topic}</strong> - ${this.formatTimestamp(topic.timestamp)}
            `;
            topicsContent.appendChild(topicDiv);
        });

        // Show topics section
        document.getElementById('results').style.display = 'block';
        document.getElementById('topicsSection').style.display = 'block';
        
        // Hide other sections
        document.getElementById('quizSection').style.display = 'none';
        document.getElementById('summarySection').style.display = 'none';
        document.getElementById('chatSection').style.display = 'none';
    }

    formatTimestamp(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    startChat() {
        if (!this.currentVideo) {
            this.showError('No video detected');
            return;
        }

        // Show chat section
        document.getElementById('results').style.display = 'block';
        document.getElementById('chatSection').style.display = 'block';
        
        // Hide other sections
        document.getElementById('quizSection').style.display = 'none';
        document.getElementById('summarySection').style.display = 'none';
        document.getElementById('topicsSection').style.display = 'none';

        // Clear chat messages
        document.getElementById('chatMessages').innerHTML = '';
        
        this.showSuccess('Chat started! Ask questions about the video.');
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (!message) return;

        // Add user message to chat
        this.addChatMessage(message, 'user');
        chatInput.value = '';

        // Disable input while processing
        chatInput.disabled = true;
        document.getElementById('sendChatBtn').disabled = true;

        // Add a placeholder for the bot message
        const chatMessages = document.getElementById('chatMessages');
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'chat-message chat-bot';
        botMessageDiv.textContent = '';
        chatMessages.appendChild(botMessageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const response = await this.makeApiCall('/chat', {
                video_id: this.currentVideo.videoId,
                video_url: this.currentVideo.videoUrl,
                question: message
            });

            botMessageDiv.textContent = response.answer;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (error) {
            botMessageDiv.textContent = 'Sorry, I encountered an error: ' + error.message;
        } finally {
            // Re-enable input
            chatInput.disabled = false;
            document.getElementById('sendChatBtn').disabled = false;
            chatInput.focus();
        }
    }

    addChatMessage(message, sender) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message chat-${sender}`;
        messageDiv.textContent = message;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Initialize the extension when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new YouTubeQuizGenerator();
}); 