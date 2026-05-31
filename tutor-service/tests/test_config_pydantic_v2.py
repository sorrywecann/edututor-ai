"""Pin Pydantic v2 config-style migration.

Phase 5b's tail end migrated LLMConfig, RAGConfig, TTSConfig from the
deprecated 'class Config:' pattern to model_config = SettingsConfigDict(...).
This test catches a silent regression: if anyone reverts to the old style,
Python emits a PydanticDeprecatedSince20 warning per config class on every
import — making `pytest -W error::DeprecationWarning` fail and signalling
that the v3 upgrade path is broken.

Pinning this contract is cheap and fully captures the migration intent.
"""
import pytest
from pydantic_settings import SettingsConfigDict


@pytest.mark.parametrize(
    "config_module,config_class_name",
    [
        ("app.config.llm_config", "LLMConfig"),
        ("app.config.rag_config", "RAGConfig"),
        ("app.config.tts_config", "TTSConfig"),
    ],
)
def test_config_uses_settings_config_dict(config_module, config_class_name):
    import importlib

    mod = importlib.import_module(config_module)
    cls = getattr(mod, config_class_name)

    assert hasattr(cls, "model_config"), (
        f"{config_class_name} must define model_config = SettingsConfigDict(...). "
        "If you see this, someone reverted the Pydantic v2 migration — the old "
        "'class Config:' pattern is deprecated and will break in Pydantic v3."
    )
    assert isinstance(cls.model_config, dict), (
        f"{config_class_name}.model_config must be a SettingsConfigDict (dict-shaped)"
    )
    assert "env_prefix" in cls.model_config, (
        f"{config_class_name}.model_config must specify env_prefix to preserve "
        "env-var resolution"
    )


def test_no_inner_config_class_remaining():
    """Regression guard: none of the migrated configs should have an inner
    'Config' class. Pydantic v2 BaseSettings ignores it and warns; if a
    contributor re-adds one (e.g. copy-pasting from old docs), this test
    fails immediately rather than letting the warning fester."""
    import importlib

    for module_name, class_name in [
        ("app.config.llm_config", "LLMConfig"),
        ("app.config.rag_config", "RAGConfig"),
        ("app.config.tts_config", "TTSConfig"),
    ]:
        mod = importlib.import_module(module_name)
        cls = getattr(mod, class_name)
        assert not hasattr(cls, "Config") or not isinstance(getattr(cls, "Config"), type), (
            f"{class_name} has an inner 'class Config:' — migrate to "
            "model_config = SettingsConfigDict(...) per Pydantic v2"
        )
