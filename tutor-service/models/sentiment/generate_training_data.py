#!/usr/bin/env python3
"""Generate 1500 Slovak tutoring sentences for BERT sentiment fine-tuning."""
import csv
import random
from pathlib import Path

random.seed(42)
OUT = Path(__file__).parent / "sk_sentiment_dataset.csv"

TEMPLATES = {
    "positive": {
        "celebrating": [
            "Výborne! {topic} si zvládol na jednotku.",
            "Skvelé! Presne tak, {concept} funguje práve takto.",
            "Perfektné! Tvoja odpoveď o {topic} je úplne správna.",
            "Bravo! Vidím, že {concept} ti už ide skvele.",
            "Fantastické riešenie! {topic} si pochopil dokonale.",
            "Úžasne! Takáto odpoveď o {concept} ma teší.",
            "Výnimočný výkon! {topic} zvládaš na výbornú.",
            "Super práca s {concept}! Presne to som chcel počuť.",
            "Skvelo si to vyriešil! {topic} je jasný.",
            "Výborne, presne tak sa {concept} implementuje.",
        ],
        "proud": [
            "Vidím, že robíš veľký pokrok v {topic}.",
            "Som hrdý na to, ako zvládaš {concept}.",
            "Zlepšil si sa v {topic} oproti minulému týždňu.",
            "Rastieš ako programátor, {concept} ti ide čoraz lepšie.",
            "Vidím pokrok v tvojom chápaní {topic}.",
            "To si zvládol sám! {concept} je pre teba jasný.",
            "Som rada, že {topic} ti už nerobí problémy.",
            "Vidím, že si sa naučil {concept} veľmi dobre.",
            "Tvoj pokrok v {topic} je skutočne pôsobivý.",
            "Vedel som, že {concept} zvládneš. A zvládol si to.",
        ],
        "encouraging_mild": [
            "Dobre, si na správnej ceste s {topic}.",
            "Pokračuj tak ďalej, {concept} sa ti darí.",
            "Áno, toto je dobrý smer pri {topic}.",
            "Skoro si tam, {concept} potrebuje len malú úpravu.",
            "Pekne, len pokračuj s {topic}.",
            "Dobrá práca, {concept} vyzerá sľubne.",
            "Správny prístup k {topic}, len dolaď detaily.",
            "Hej, rozumieš {concept}, to je hlavné.",
            "V poriadku, {topic} ide dobrým smerom.",
            "Fajn, základ {concept} máš správne.",
        ],
    },
    "negative": {
        "correcting": [
            "Nie, toto nie je správna odpoveď. {concept} znamená niečo iné.",
            "Bohužiaľ, {topic} nefunguje takto. Skús to inak.",
            "Chyba. {concept} sa nepoužíva týmto spôsobom.",
            "Nesprávne. {topic} vyžaduje iný prístup.",
            "To nie je celkom správne. {concept} má inú definíciu.",
            "Omyl. Pri {topic} treba postupovať inak.",
            "Nie, skúste znova. {concept} funguje odlišne.",
            "Toto je nesprávne riešenie pre {topic}.",
            "Bohužiaľ nie. {concept} sa tak neimplementuje.",
            "Chyba v odpovedi. {topic} treba pochopiť inak.",
        ],
        "patient": [
            "Nevadí, skúsme to znova. {topic} je náročná téma.",
            "Nič sa nedeje, {concept} vyžaduje prax.",
            "Pomaly a postupne. {topic} pochopíš.",
            "To je v poriadku, veľa študentov má problémy s {concept}.",
            "Nevadí, poďme si {topic} vysvetliť ešte raz.",
            "Nič sa nestalo, {concept} nie je jednoduchý.",
            "Dajme si {topic} ešte raz, tentoraz podrobnejšie.",
            "Trpezlivosť, {concept} príde s praxou.",
            "Nevadí, chyby sú súčasťou učenia. {topic} zvládneš.",
            "Pozrime sa na {concept} z iného uhla.",
        ],
    },
    "neutral": {
        "curious": [
            "Zaujímavá otázka o {topic}. Pozrime sa na to bližšie.",
            "Dobrá otázka. {concept} je zaujímavá téma.",
            "Hmm, {topic} — to je naozaj dobrá otázka.",
            "Pozrime sa na {concept} podrobnejšie.",
            "Zaujímavý pohľad na {topic}.",
            "To je relevantná otázka o {concept}.",
            "Dobre sa pýtaš na {topic}.",
            "Poďme preskúmať {concept} hlbšie.",
            "Zaujímalo by ma, prečo sa pýtaš na {topic}.",
            "Výborná otázka, {concept} si zaslúži pozornosť.",
        ],
        "thinking_deep": [
            "Hmm, {topic} je zložitejší problém. Treba to rozobrať.",
            "Poďme sa zamyslieť nad {concept} krok po kroku.",
            "Toto vyžaduje hlbšiu analýzu {topic}.",
            "Zamyslime sa nad {concept} systematicky.",
            "Moment, {topic} potrebuje dôkladnejší rozbor.",
            "Poďme analyzovať {concept} od základov.",
            "Toto je komplexný problém. {topic} má viac vrstiev.",
            "Premýšľam nad {concept}... je tam viacero aspektov.",
            "Rozmýšľam, ako najlepšie vysvetliť {topic}.",
            "Toto si zaslúži hlbší pohľad na {concept}.",
        ],
        "neutral": [
            "Dobre, pokračujme s {topic}.",
            "Poďme ďalej na {concept}.",
            "V poriadku, prejdime k {topic}.",
            "Tak teda, {concept} je naša ďalšia téma.",
            "Dobre, pozrime sa teraz na {topic}.",
            "Prejdime k ďalšej časti o {concept}.",
            "Tak, {topic} — začneme od začiatku.",
            "V poriadku, {concept} si teraz vysvetlíme.",
            "Ideme na {topic}.",
            "Tak poďme na {concept}.",
        ],
        "surprise": [
            "Oh, to je neočakávaná otázka o {topic}!",
            "Prekvapuješ ma, {concept} je pokročilá téma.",
            "Wow, nečakal som otázku o {topic} tak skoro.",
            "To ma prekvapuje! {concept} zvyčajne študenti neriešia.",
            "Zaujímavé! Nečakal som, že sa budeš pýtať na {topic}.",
        ],
    },
}

TOPICS = [
    "triedy a objekty", "dedičnosť", "polymorfizmus", "enkapsulácia", "abstraktné triedy",
    "rozhrania", "SOLID princípy", "návrhové vzory", "premenné", "cykly",
    "funkcie", "ukazovatele", "polia", "štruktúry", "rekurzia",
    "správa pamäti", "súbory", "spájané zoznamy", "stromy", "grafy",
    "triedenie", "vyhľadávanie", "hash tabuľky", "zložitosť algoritmov", "dynamické programovanie",
    "strojové učenie", "neurónové siete", "klasifikácia", "klastrovanie", "regresia",
    "NLP", "limity", "derivácie", "integrály", "diferenciálne rovnice",
    "Taylorov rad", "matice", "determinanty", "vlastné čísla", "gradient descent",
]
CONCEPTS = [
    "trieda", "objekt", "dedičnosť", "polymorfizmus", "enkapsulácia",
    "abstrakcia", "rozhranie", "Singleton vzor", "Factory vzor", "premenná",
    "for cyklus", "funkcia", "pointer", "pole", "struct",
    "rekurzia", "malloc", "fread", "linked list", "binárny strom",
    "BFS", "DFS", "quick sort", "hash funkcia", "O-notácia",
    "backtracking", "neurón", "perceptrón", "konvolúcia", "RNN",
    "transformer", "attention", "embedding", "limita", "derivácia",
    "integrál", "Taylorov polynom", "Gaussova eliminácia", "determinant", "gradient",
]

rows = []
for sentiment, emotions in TEMPLATES.items():
    for emotion, templates in emotions.items():
        target = {"positive": 167, "negative": 200, "neutral": 150}.get(sentiment, 150)
        target = target if emotion not in ("surprise",) else 50
        for i in range(target):
            t = random.choice(templates)
            topic = random.choice(TOPICS)
            concept = random.choice(CONCEPTS)
            sentence = t.format(topic=topic, concept=concept)
            rows.append({"text": sentence, "label": sentiment, "emotion": emotion})

random.shuffle(rows)
rows = rows[:1500]

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["text", "label", "emotion"])
    w.writeheader()
    w.writerows(rows)

print(f"Generated {len(rows)} sentences to {OUT}")
from collections import Counter
labels = Counter(r["label"] for r in rows)
emotions = Counter(r["emotion"] for r in rows)
print(f"Labels: {dict(labels)}")
print(f"Emotions: {dict(emotions)}")
