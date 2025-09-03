from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import Optional, List, Any, Dict
import re
import redis
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from typing_extensions import TypedDict
import os
from dotenv import load_dotenv
from uuid import uuid4
import json

# --- LangChain/LangGraph/Elasticsearch Imports ---
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from langchain.prompts import PromptTemplate

from langchain_core.output_parsers import PydanticOutputParser

app = FastAPI()

# Initialize Redis client (default localhost:6379)
load_dotenv()
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_client = redis.Redis(host=redis_host, port=6379, db=0, decode_responses=True)

# --- Request Models ---
class QuizRequest(BaseModel):
    video_url: HttpUrl
    video_id: Optional[str] = None
    difficulty: str  # 'easy', 'medium', 'hard'
    num_questions: int = 5

class VerifyAnswersRequest(BaseModel):
    video_url: HttpUrl
    video_id: Optional[str] = None
    user_answers: List[Any]
    quiz_id: str = None

class SummaryRequest(BaseModel):
    video_url: HttpUrl
    video_id: Optional[str] = None

class TopicsRequest(BaseModel):
    video_url: HttpUrl
    video_id: Optional[str] = None

class ChatRequest(BaseModel):
    video_url: HttpUrl
    video_id: Optional[str] = None
    question: str

class TranscriptRequest(BaseModel):
    video_url: HttpUrl
    video_title: Optional[str] = None
    video_id: Optional[str] = None

def extract_video_id(url: str) -> str:
    # Extracts the YouTube video ID from a URL
    match = re.search(r"(?:v=|youtu.be/)([\w-]{11})", url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid YouTube video URL.")
    return match.group(1)

def get_video_id_from_request(request) -> str:
    video_id = getattr(request, 'video_id', None)
    if video_id:
        return video_id
    video_url = getattr(request, 'video_url', None)
    if video_url:
        try:
            return extract_video_id(str(video_url))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid video_url: {str(e)}")
    raise HTTPException(status_code=400, detail="Either video_id or video_url must be provided.")

@app.post("/transcript")
def get_transcript(request: TranscriptRequest):
    try:
        video_id = request.video_id or extract_video_id(str(request.video_url))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    cache_key = f"transcript:{video_id}"
    transcript = redis_client.get(cache_key)
    if transcript:
        return {"video_id": video_id, "transcript": transcript, "cached": True}

    try:
        transcript_list = YouTubeTranscriptApi().fetch(video_id).to_raw_data()
        transcript_text = " ".join([item["text"] for item in transcript_list])
        if not transcript_text.strip():
            raise HTTPException(status_code=404, detail="Transcript is empty.")
        redis_client.set(cache_key, transcript_text)
        return {"video_id": video_id, "transcript": transcript_text, "cached": False}
    except (TranscriptsDisabled, NoTranscriptFound):
        raise HTTPException(status_code=404, detail="Transcript not available for this video.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcript extraction failed: {str(e)}")

# --- LangChain LLM ---
llm = ChatOpenAI(model="gpt-4o-mini")

# --- State Schema for LangGraph ---
class QuizState(TypedDict, total=False):
    video_id: str
    transcript: str
    difficulty: str
    num_questions: int
    question: str
    summary: str
    topics: list[str]
    answer: str
    questions: list[Dict[str, Any]]

# --- Quiz Question Model for quiz_generator output parsing ---
class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    answer: str

class QuizQuestions(BaseModel):
    questions: List[QuizQuestion]

# --- LangGraph Node Functions ---
def transcript_loader(state: QuizState) -> dict:
    video_id = state.get("video_id")
    if not video_id:
        return {"transcript": ""}
    cache_key = f"transcript:{video_id}"
    transcript = redis_client.get(cache_key)
    if transcript:
        return {"transcript": transcript}
    transcript_list = YouTubeTranscriptApi().fetch(video_id).to_raw_data()
    transcript_text = " ".join([item["text"] for item in transcript_list])
    if transcript_text.strip():
        redis_client.set(cache_key, transcript_text)
    return {"transcript": transcript_text}

def quiz_generator(state: QuizState) -> dict:
    transcript = state.get("transcript", "")
    difficulty = state.get("difficulty", "medium")
    num_questions = state.get("num_questions", 5)

    generate_quiz_prompt = PromptTemplate.from_template("""
        Generate {num_questions} {difficulty} level multiple-choice quiz questions 
        from the following transcript. Each question should have exactly 4 options, 
        with 1 correct answer and 3 plausible distractors. 
        
        Return the output in **valid JSON** only.
        Use this schema:
        {format_instructions}
        
        Transcript:
        "{transcript}"
    """)

    parser = PydanticOutputParser(pydantic_object=QuizQuestions)
    chain = generate_quiz_prompt | llm | parser

    questions = chain.invoke({
        "transcript": transcript,
        "difficulty": difficulty,
        "num_questions": num_questions,
        "format_instructions": parser.get_format_instructions()
    })

    return {"questions": questions.questions}

def summarizer(state: QuizState) -> dict:
    transcript = state.get("transcript", "")
    prompt = f"Summarize this transcript: {transcript}..."
    summary = llm.invoke(prompt)
    return {"summary": summary.content}

def topic_extractor(state: QuizState) -> dict:
    transcript = state.get("transcript", "")
    print("######################################")
    print(transcript)
    print("######################################")
    prompt = f"Extract main topics with timestamps from this transcript: {transcript}..."
    topics = llm.invoke(prompt)
    return {"topics": topics.content}

def qna_agent(state: QuizState) -> dict:
    transcript = state.get("transcript", "")
    question = state.get("question", "")
    prompt = f"Give short and clear answer to the question based on this context: {transcript}\nQuestion: {question}"
    answer = llm.invoke(prompt)
    return {"answer": answer.content}

# --- StateGraph Setup ---
graph = StateGraph(QuizState)
graph.add_node("transcript_loader", transcript_loader)
graph.add_node("quiz_generator", quiz_generator)
graph.add_node("summarizer", summarizer)
graph.add_node("topic_extractor", topic_extractor)
graph.add_node("qna_agent", qna_agent)
graph.add_edge("transcript_loader", "quiz_generator")
graph.add_edge("transcript_loader", "summarizer")
graph.add_edge("transcript_loader", "topic_extractor")
graph.add_edge("transcript_loader", "qna_agent")
quiz_graph = graph

# --- Update Endpoints to Use Graph (scaffold only, not full integration) ---
@app.post("/generate-quiz")
def generate_quiz(request: QuizRequest):
    video_id = get_video_id_from_request(request)
    state = {"video_id": video_id, "difficulty": request.difficulty, "num_questions": request.num_questions}
    state.update(quiz_graph.nodes["transcript_loader"].runnable.invoke(state))
    state.update(quiz_graph.nodes["quiz_generator"].runnable.invoke(state))

    quiz_id = str(uuid4())
    questions = QuizQuestions(questions=state["questions"])
    redis_client.set(f"quiz:{quiz_id}", questions.model_dump_json(), ex=3600)  # Cache for 1 hour

    print("Generated Questions:", state["questions"])

    for question in state["questions"]:
        if hasattr(question, "answer"):
            delattr(question, "answer")

    return {
        "video_id": video_id,
        "difficulty": request.difficulty,
        "questions": state["questions"],
        "quiz_id": quiz_id,
        "message": "Quiz generated via LangGraph."
    }

@app.post("/verify-answers")
def verify_answers(request: VerifyAnswersRequest):
    questions = []
    raw_data = redis_client.get(f"quiz:{request.quiz_id}")
    if raw_data:
        quiz_data = QuizQuestions.model_validate_json(raw_data)
        questions = quiz_data.questions

    correct_answers = []
    if questions:
        correct_answers = [i for q in questions for i, op in enumerate(q.options) if q.answer == op]
    
    results = [ua == ca for ua, ca in zip(request.user_answers, correct_answers)]

    return {
        "video_id": request.video_id,
        "results": results,
        "message": "Answer verification not yet implemented."
    }

@app.post("/generate-summary")
def generate_summary(request: SummaryRequest):
    video_id = get_video_id_from_request(request)
    state = {"video_id": video_id}
    state.update(quiz_graph.nodes["transcript_loader"].runnable.invoke(state))
    state.update(quiz_graph.nodes["summarizer"].runnable.invoke(state))
    return {
        "video_id": video_id,
        "summary": state["summary"],
    }

@app.post("/generate-topics")
def generate_topics(request: TopicsRequest):
    video_id = get_video_id_from_request(request)
    state = {"video_id": video_id}
    state.update(quiz_graph.nodes["transcript_loader"].runnable.invoke(state))
    state.update(quiz_graph.nodes["topic_extractor"].runnable.invoke(state))
    return {
        "video_id": video_id,
        "topics": state["topics"],
        "message": "Topics extracted via LangGraph."
    }

@app.post("/chat")
async def chat_with_video(request: ChatRequest):
    video_id = get_video_id_from_request(request)
    state = {"video_id": video_id, "question": request.question}
    state.update(quiz_graph.nodes["transcript_loader"].runnable.invoke(state))
    state.update(quiz_graph.nodes["qna_agent"].runnable.invoke(state))

    return {
        "video_id": video_id,
        "answer": state["answer"],
    }

@app.get("/")
def root():
    return {"message": "YouTube Quiz Generator Backend is running."}
