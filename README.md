# YouTube Quiz Generator

## Project Goal
Create a browser extension and backend system that generates interactive quizzes, summaries, topics, and chat experiences from YouTube videos using AI. The goal is to help users learn more effectively from video content by providing quizzes, summaries, and interactive Q&A based on the video transcript.

## Main Features
- Generate quizzes from YouTube video transcripts with selectable difficulty.
- Extract and display key topics with timestamps.
- Summarize YouTube videos.
- Provide a chat interface for Q&A about the video content (retrieval-augmented generation).
- Verify quiz answers and highlight correct ones.
- Cache transcripts for faster repeated access.
- Browser extension UI for easy access to all features.

## Tech Stack

### Backend
- **FastAPI**: Web framework for building REST APIs.
- **LangChain**: Framework for building applications with LLMs.
- **LangGraph**: Orchestration of multi-step LLM workflows.
- **OpenAI**: LLM provider for quiz, summary, and chat generation.
- **YouTubeTranscriptApi**: Extracts transcripts from YouTube videos.
- **Redis**: Caching transcripts and other data.
- **Elasticsearch**: Vector database for transcript embeddings and retrieval.

### Frontend (Browser Extension)
- **Vanilla JavaScript**: Core logic for the extension.
- **HTML/CSS**: UI for the extension popup and content scripts.

---

**Next Steps:**
- Backend environment setup and dependency installation (see development.md step 2).
- Frontend extension folder structure and logic (see development.md step 3). 