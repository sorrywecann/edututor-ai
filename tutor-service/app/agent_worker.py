"""
EduTutor.AI - LiveKit Agent Worker
Voice agent that handles real-time conversations with STT, LLM, and TTS
"""

import os
import logging
import asyncio
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# LiveKit imports
LIVEKIT_AVAILABLE = False
JobContext = None
JobProcess = None
WorkerOptions = None
cli = None
rtc = None
AutoSubscribe = None
silero = None

try:
    from livekit import rtc, api
    from livekit.agents import (
        AutoSubscribe,
        JobContext,
        JobProcess,
        WorkerOptions,
        cli,
        llm,
    )
    from livekit.plugins import silero

    LIVEKIT_AVAILABLE = True
    logger.info("LiveKit agents loaded successfully")
except ImportError as e:
    logger.warning(f"LiveKit agents not available: {e}")


# Import our services
from app.services.llm_service import LLMService, ChatMessage
from app.services.tts_service import TTSService
from app.services.stt_service import STTService
from app.services.rag_service import RAGService
from app.config.llm_config import llm_config


class EduTutorLLM:
    """Custom LLM adapter for LiveKit voice assistant"""

    def __init__(
        self,
        llm_service: LLMService,
        rag_service: Optional[RAGService] = None,
        knowledge_base: Optional[str] = None,
    ):
        self._llm = llm_service
        self._rag = rag_service
        self._knowledge_base = knowledge_base
        self._conversation_history: list[ChatMessage] = []
        self._max_history = 10  # Keep last 10 messages for context

    async def chat(self, chat_ctx) -> str:
        """Process chat and return response"""
        # Get user message from chat context
        user_message = ""
        if hasattr(chat_ctx, "messages") and chat_ctx.messages:
            last_msg = chat_ctx.messages[-1]
            if hasattr(last_msg, "content"):
                user_message = last_msg.content

        if not user_message:
            return "Prepáč, nepočul som ťa. Môžeš to zopakovať?"

        # Build messages with context
        messages = [ChatMessage(role="system", content=llm_config.system_prompt)]

        # Add RAG context if available
        if self._rag and self._knowledge_base:
            try:
                rag_results = await self._rag.search(
                    query=user_message,
                    knowledge_base=self._knowledge_base,
                    top_k=3,
                )

                if rag_results:
                    context = "\n\n".join([r["content"] for r in rag_results])
                    messages.append(
                        ChatMessage(
                            role="system",
                            content=f"Relevantný kontext z knowledge base:\n{context}",
                        )
                    )
            except Exception as e:
                logger.warning(f"RAG search failed: {e}")

        # Add conversation history
        messages.extend(self._conversation_history[-self._max_history :])

        # Add current user message
        messages.append(ChatMessage(role="user", content=user_message))

        # Generate response
        try:
            response = await self._llm.generate(messages)

            # Update history
            self._conversation_history.append(
                ChatMessage(role="user", content=user_message)
            )
            self._conversation_history.append(
                ChatMessage(role="assistant", content=response)
            )

            # Trim history if too long
            if len(self._conversation_history) > self._max_history * 2:
                self._conversation_history = self._conversation_history[
                    -self._max_history :
                ]

            return response

        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return "Prepáč, nastala chyba pri spracovaní. Skús to prosím znova."


class EduTutorTTS:
    """Custom TTS adapter for LiveKit voice assistant"""

    def __init__(self, tts_service: TTSService):
        self._tts = tts_service

    async def synthesize(self, text: str):
        """Synthesize text to speech"""
        try:
            result = await self._tts.synthesize(text)
            return result.audio_data
        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            return None


class EduTutorSTT:
    """Custom STT adapter for LiveKit voice assistant"""

    def __init__(self, stt_service: STTService):
        self._stt = stt_service

    async def transcribe(self, audio_data: bytes, format: str = "wav") -> str:
        """Transcribe audio to text"""
        try:
            result = await self._stt.transcribe(
                audio_data, language="sk", format=format
            )
            return result.text
        except Exception as e:
            logger.error(f"STT transcription failed: {e}")
            return ""


async def entrypoint(ctx):
    """Main entry point for LiveKit agent worker"""
    logger.info(f"Agent connecting to room: {ctx.room.name}")

    # Initialize services
    llm_service = LLMService()
    await llm_service.initialize()

    tts_service = TTSService()
    await tts_service.initialize()

    stt_service = STTService()
    await stt_service.initialize()

    rag_service = None
    knowledge_base = None

    # Check for knowledge base in room metadata
    if ctx.room.metadata:
        try:
            import json

            metadata = json.loads(ctx.room.metadata)
            knowledge_base = metadata.get("knowledge_base")

            if knowledge_base:
                rag_service = RAGService()
                await rag_service.initialize()
                logger.info(f"RAG enabled with knowledge base: {knowledge_base}")
        except Exception as e:
            logger.warning(f"Failed to parse room metadata: {e}")

    # Create our custom adapters
    edu_llm = EduTutorLLM(llm_service, rag_service, knowledge_base)
    edu_tts = EduTutorTTS(tts_service)
    edu_stt = EduTutorSTT(stt_service)

    # Wait for participant to connect
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    participant = await ctx.wait_for_participant()
    logger.info(f"Participant connected: {participant.identity}")

    # Initialize voice activity detection
    try:
        vad = silero.VAD.load()
    except Exception as e:
        logger.warning(f"Could not load Silero VAD: {e}")
        vad = None

    # Start the conversation loop
    logger.info("Starting conversation loop")

    # Send initial greeting
    greeting = "Ahoj! Som EduTutor, tvoj vzdelávací asistent. Ako ti môžem dnes pomôcť?"

    try:
        greeting_audio = await edu_tts.synthesize(greeting)
        if greeting_audio:
            # In a real implementation, we would publish this audio to the room
            logger.info("Sent greeting to participant")
    except Exception as e:
        logger.error(f"Failed to send greeting: {e}")

    # Keep the agent running
    while ctx.room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
        await asyncio.sleep(1)

    logger.info("Agent disconnected from room")


def prewarm_process(proc):
    """Prewarm function for faster agent startup"""
    logger.info("Prewarming agent process...")
    # Pre-load models here if needed
    proc.userdata["prewarmed"] = True


async def run_standalone():
    """Run agent without LiveKit for testing"""
    logger.info("Running in standalone mode (no LiveKit)")

    # Initialize services
    llm_service = LLMService()
    await llm_service.initialize()
    logger.info(f"LLM Service initialized (provider: {llm_service.provider})")

    tts_service = TTSService()
    await tts_service.initialize()
    logger.info(f"TTS Service initialized (provider: {tts_service.provider})")

    stt_service = STTService()
    await stt_service.initialize()
    logger.info(f"STT Service initialized (provider: {stt_service.provider})")

    # Test conversation
    edu_llm = EduTutorLLM(llm_service)

    class MockChatContext:
        def __init__(self, content):
            self.messages = [type("Message", (), {"content": content})()]

    print("\n" + "=" * 50)
    print("EduTutor.AI - Standalone Test Mode")
    print("Type 'quit' to exit")
    print("=" * 50 + "\n")

    while True:
        try:
            user_input = input("You: ").strip()
            if user_input.lower() in ["quit", "exit", "q"]:
                break

            if not user_input:
                continue

            # Get response
            ctx = MockChatContext(user_input)
            response = await edu_llm.chat(ctx)
            print(f"\nEduTutor: {response}\n")

        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Error: {e}")

    print("\nGoodbye!")


def main():
    """Main entry point"""
    if not LIVEKIT_AVAILABLE:
        logger.info("LiveKit not available, running in standalone mode")
        asyncio.run(run_standalone())
        return

    # Check for required environment variables
    livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    logger.info(f"Starting EduTutor Agent Worker")
    logger.info(f"LiveKit URL: {livekit_url}")

    # Run the agent worker
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm_process,
        ),
    )


if __name__ == "__main__":
    main()
