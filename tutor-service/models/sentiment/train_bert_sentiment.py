#!/usr/bin/env python3
"""Fine-tune DistilBERT for Slovak tutoring sentiment classification.

Grant: PB2 — Csilla Kovacova, August 2025
Dataset: 1500 Slovak tutoring sentences (positive/negative/neutral)
Base model: distilbert-base-uncased-finetuned-sst-2-english
Target: ~89-91% accuracy on 80/20 train/val split
"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments,
)
from datasets import Dataset

MODEL_NAME = "distilbert-base-uncased-finetuned-sst-2-english"
DATA_PATH = Path(__file__).parent / "sk_sentiment_dataset.csv"
OUTPUT_DIR = Path(__file__).parent / "output" / "edututor-sentiment-sk"
LABEL_MAP = {"positive": 0, "negative": 1, "neutral": 2}

def main():
    df = pd.read_csv(DATA_PATH)
    df["label_id"] = df["label"].map(LABEL_MAP)
    print(f"Dataset: {len(df)} samples")
    print(f"Distribution:\n{df['label'].value_counts()}\n")

    train_df, val_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df["label_id"])
    print(f"Train: {len(train_df)}, Val: {len(val_df)}")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=3, ignore_mismatched_sizes=True)

    def tokenize(batch):
        return tokenizer(batch["text"], padding="max_length", truncation=True, max_length=128)

    train_ds = Dataset.from_pandas(train_df[["text", "label_id"]].rename(columns={"label_id": "labels"}))
    val_ds = Dataset.from_pandas(val_df[["text", "label_id"]].rename(columns={"label_id": "labels"}))
    train_ds = train_ds.map(tokenize, batched=True)
    val_ds = val_ds.map(tokenize, batched=True)

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=3,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        learning_rate=2e-5,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        logging_steps=50,
        seed=42,
    )

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {"accuracy": accuracy_score(labels, preds)}

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    print("Training...")
    trainer.train()

    preds_output = trainer.predict(val_ds)
    preds = np.argmax(preds_output.predictions, axis=-1)
    labels = val_ds["labels"]
    inv_map = {v: k for k, v in LABEL_MAP.items()}

    print("\n" + "=" * 50)
    print(f"Final Accuracy: {accuracy_score(labels, preds):.4f}")
    print("=" * 50)
    print(classification_report(labels, preds, target_names=list(LABEL_MAP.keys())))

    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"\nModel saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
