"""
EduTutor.AI - Configuration Module
"""

from app.config.llm_config import LLM_CONFIG, get_llm_config
from app.config.rag_config import RAG_CONFIG, get_rag_config
from app.config.tts_config import TTS_CONFIG

__all__ = [
    "LLM_CONFIG",
    "RAG_CONFIG", 
    "TTS_CONFIG",
    "get_llm_config",
    "get_rag_config",
]
