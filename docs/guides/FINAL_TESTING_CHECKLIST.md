# EduTutor.AI — Final Testing Checklist

**Datum:** _______________
**Tester:** _______________
**Prostredie:** localhost:3000 + localhost:8000

---

## A. LOGIN + PRVE SPUSTENIE

- [ ] 1. Otvor http://localhost:3000
- [ ] 2. Vidis login stranku
- [ ] 3. Zadaj: demo@edututor.sk / edututor2026 → prihlasis sa
- [ ] 4. Hardware Setup modal sa zobrazi (prvy raz)
- [ ] 5. Vidis detekovany HW (RAM, CPU, GPU)
- [ ] 6. Vidis tutor picker (Lukas / Viktoria) v modali
- [ ] 7. Klikni "Pouzit" → modal sa zavrie
- [ ] 8. Po refreshi sa modal UZ NEZOBRAZI

## B. HLAVNA STRANKA — VOICE CHAT

- [ ] 9. Vidis orb uprostred
- [ ] 10. Vidis tutor picker (L/V kruzky) nad orbom
- [ ] 11. Prepni tutora na Viktoria → topbar ukazuje "Viktoria"
- [ ] 12. Prepni spat na Lukas → topbar ukazuje "Lukas"
- [ ] 13. Topbar zobrazuje: tutor · stt · llm · tts · avatar
- [ ] 14. Klikni na orb → zacne nahravat (orb zmeni farbu)
- [ ] 15. Povedz nieco po slovensky → cakaj na odpoved
- [ ] 16. POCUJES audio odpoved? (Edge TTS)
- [ ] 17. VIDIS text odpovede v message streame?
- [ ] 18. Klikni orb znova → session sa ukonci

## C. TEXT CHAT (ak voice nefunguje)

- [ ] 19. V spodnej casti je textovy input
- [ ] 20. Napis "Ahoj" → odosli
- [ ] 21. Dostanes textovu odpoved od LLM

## D. KNOWLEDGE BASE (Znalosti)

- [ ] 22. Klikni "Znalosti" v sidebar
- [ ] 23. Vidis existujuce KB (Matematika, haahha, XYZ)
- [ ] 24. Klikni na "Matematika" → zobrazi sa document strip
- [ ] 25. Vidis skripta10.pdf v strip
- [ ] 26. Chat input dole — napis "Co je limita?"
- [ ] 27. Dostanes odpoved S CITACIAMI z PDF
- [ ] 28. Klikni "Nova znalostna baza" → vypln nazov → vytvori sa
- [ ] 29. Upload PDF subor → spracuje sa (status: processing → ready)
- [ ] 30. Zmaz testovaciu KB

## E. POKROK (Progress)

- [ ] 31. Klikni "Pokrok" v sidebar
- [ ] 32. Vidis 6 stat kariet (Konverzacie, Odpovede, Otazky, Slova tutora, Tvoje slova, Seria)
- [ ] 33. Vidis 14-dnovy activity chart
- [ ] 34. Vidis zoznam nedavnych tem

## F. HISTORIA

- [ ] 35. Klikni "Historia" v sidebar
- [ ] 36. Vidis zoznam predchadzajucich konverzacii
- [ ] 37. Klikni na konverzaciu → vidis spravy

## G. PROVIDER SWITCHING

- [ ] 38. Sidebar → klikni na ozubene koliesko (Hardware Setup)
- [ ] 39. Tab "Providery" → vidis dostupne LLM modely
- [ ] 40. Prepni LLM provider → potvrdi sa zmena
- [ ] 41. Prepni TTS hlas cez VoiceZone settings

## H. TUTOR VOICE CHECK

- [ ] 42. Vyber Lukas → posli spravu → MUZSKY hlas odpovie
- [ ] 43. Vyber Viktoria → posli spravu → ZENSKY hlas odpovie

## I. DARK/LIGHT MODE

- [ ] 44. Klikni theme toggle v topbar (slnko/mesiac)
- [ ] 45. Prepne sa svetly/tmavy rezim
- [ ] 46. Refreshni → mode sa zachova

---

## VYSLEDOK

**Uspesne:** ___/46
**Neuspesne:** ___
**Poznamky:**

_______________________________________________
_______________________________________________
_______________________________________________
_______________________________________________

---

*EduTutor.AI · SORRYWECAN s.r.o. · Grant 09I05-03-V04-00072*
