# Tehnični načrt za Desktop Buddy backend

Tedenski rezultat za 16. oktober 2026. Nosilec backend dela je Nejc. Cilj je pripraviti izvedljivo arhitekturo, izbrati tehnologijo in vzpostaviti delujočo osnovo za namiznega pomočnika na Windows. Backend sprejme uporabniško zahtevo, vrne odgovor ter po potrebi ustvari datoteko ali mapo prek nadzorovanega procesa CMD.

## Obseg in razdelitev dela

Nejčev del obsega lokalni API, razumevanje zahtev, datotečna opravila, validacijo, konfiguracijo, dnevnik in teste. Frontend ekipa pripravi lik, prosojno namizno okno, položaj ob opravilni vrstici, dogodke miške, skok in pogovorno okno. Backend ponuja dogodka `hover` in `leave`; sam ne spremlja kazalca in ne upravlja opravilne vrstice.

Prva ciljna platforma je Windows 10 ali 11. Podpora drugim sistemom, glasovno upravljanje in distribucijski namestitveni paket niso vključeni v tedenski prototip. Na drugih sistemih worker teče neposredno prek Node.js; preverjanje je bilo izvedeno na Windows.

## Ocena tehnične zahtevnosti

Ocene veljajo za študentsko ekipo z osnovnim znanjem JavaScripta. Čas pomeni osredotočene razvojne dni ene osebe, vključuje osnovno preverjanje in je okviren; vrstice niso zavezujoč terminski plan.

| Funkcionalnost | Zahtevnost | Okviren čas | Glavni izziv |
| --- | --- | --- | --- |
| Lokalni API in konfiguracija | nizka do srednja | 1 dan | povezava z namiznim procesom in žeton |
| Ustvarjanje map in datotek prek CMD | srednja | 1 do 2 dni | poti, šumniki, napake in preprečevanje prepisovanja |
| Pogovor z lokalnim modelom | srednja | 1 do 2 dni | model, hitrost in obravnava izpadov |
| Naravni jezik v preverjena opravila | visoka | 2 do 4 dni | nejasna navodila in napačni odgovori modela |
| Lik ob opravilni vrstici in skok | srednja do visoka | 2 do 4 dni za frontend | DPI, več zaslonov, prosojnost in kliki skozi okno |
| Omejitev dovoljenih dejanj in testi | visoka | 2 do 3 dni | povezave map, CMD in vhodni podatki |
| Namestitveni paket in življenjski cikel | srednja do visoka | 2 do 3 dni za ekipo | zagon backend procesa, žeton in ustavitev |

Skupna zahtevnost uporabnega prototipa je srednja do visoka. Največ negotovosti sta obnašanje namiznega okna in zanesljivost lokalnega modela. Datotečna opravila z vnaprej določenima tipoma so izvedljiva že v prvem tednu; splošen agent za izvajanje poljubnih ukazov bi bil bistveno večji projekt.

## Izbrana tehnologija

Backend uporablja Node.js 24.x in sodobni JavaScript z ES moduli. Uporablja vgrajene module za HTTP, datotečni sistem, podprocese, kriptografijo in teste. Za prototip tako ni treba nameščati knjižnic ali podatkovnega strežnika. `package-lock.json` določa stanje paketa, `.env.example` pa dokumentira konfiguracijo.

Za namizni del je predlagan Electron s HTML, CSS in JavaScriptom; frontend ekipa naj izbiro potrdi glede na svoje znanje. Omogoča skupen jezik skozi projekt in ločen glavni proces za privilegirana dejanja. React ali Vue sta mogoča, vendar za preprost lik in pogovorno okno nista potrebna. Flutter pomeni dodatni Dart in drugo integracijo z backendom; Tauri pa zahteva Rust oziroma dodatno nastavitev stranskega procesa. Trenutno nista izbrana.

Za AI je izbran lokalni ponudnik Ollama s strukturiranim JSON odgovorom in začetnim modelom Qwen3 8B. Namen je običajen pogovor v slogu Clippyja in izvajanje lokalnih opravil brez plačljivega API ali prijave. Privzeti način je Ollama, demonstracijski način brez AI pa ostaja možnost. `npm run setup:local` pripravi model in konfiguracijo, `npm run chat` omogoča preizkus pogovora v terminalu. Model je mogoče zamenjati po meritvi kakovosti slovenščine in odzivnega časa na ciljnem računalniku.

## Baza prijava in API

| Sestavina | Odločitev za prvo različico | Razlog |
| --- | --- | --- |
| Podatkovna baza | ni potrebna | lokalna konfiguracija in dnevnik JSONL zadoščata |
| Prijava uporabnika | ni potrebna | aplikacija deluje za lokalnega uporabnika Windows |
| Dostopni žeton | potreben za lokalni API | omeji klice drugih procesov in strani |
| Zunanji oblačni API | ni potreben | Ollama teče lokalno |
| Umetna inteligenca | izbirna za demo, potrebna za prosta vprašanja | ukaza brez AI ne razumeta poljubnega jezika |
| Internet | za pridobitev orodij in modela | datotečni demo deluje brez interneta |

Pogovori se zdaj ohranjajo v pomnilniku procesa, ločeno po `conversationId`. Spomin je omejen na 20 izmenjav oziroma 24.000 znakov in 50 pogovorov. Uporabnik lahko pogovor ponastavi; ponovni zagon zgodovino izbriše. SQLite je smiseln pozneje za trajno zgodovino in opravila. Qwen3 8B ima približno 5,2 GB prenosa in potrebuje dodatni RAM za izvajanje. Po prenosu pogovor ne potrebuje interneta.

## Arhitektura in izvedba opravila

Tok je: namizni renderer → omejen preload IPC → Electron glavni proces → lokalni backend → planer → validacija → CMD → Node worker → rezultat.

Glavni proces hrani žeton. Backend posluša samo na `127.0.0.1`, zahteva žeton ter zavrača spletne izvore in nedovoljen Host. Planer vrne odgovor in največ eno opravilo. Podprti tipi so `create_file`, `create_directory`, `read_file`, `list_directory`, `open_directory` in `open_app`. Dovoljeni aplikaciji sta Beležnica in Kalkulator. Izhod modela gre skozi enako validacijo kot neposredni klic API. Navaden pogovor ne sproži opravila. Pred vsakim klicem modela backend preveri, da model nima oddaljenega gostitelja in ima lokalne metapodatke GGUF. HTTP preusmeritve in oblačni modeli so zavrnjeni.

CMD se zažene skrito z `/d /s /c` ter vnaprej sestavljenim ukazom za Node worker. Uporabniški tekst, pot in vsebina ne postanejo del ukaza; worker jih prejme kot JSON na standardnem vhodu. Ta pristop izpolni izvajanje prek CMD brez izvajanja ukazov, ki jih sestavi model. Worker ima časovno omejitev 10 sekund; zahteva modelu ima omejitev 120 sekund. Raziskovalec, Beležnica in Kalkulator se iz workerja zaženejo neposredno z ločenimi argumenti. Rezultat `launched` potrjuje sprejet zagon procesa, ne prikaza okna.

Delovna mapa je uporabnikova nastavitev `BUDDY_WORKSPACE`, dodatne dovoljene mape pa določa `BUDDY_FOLDERS`. Nastavitveni skript zazna namizje, dokumente in prenose. Model izbira le dovoljeno ime mape in relativno pot. Backend zavrne prehode `..`, absolutne poti, posebna Windows imena, podatkovne tokove ADS in obstoječe simbolične povezave ali junction povezave v ciljni poti. Datoteke odpre z izključnim ustvarjanjem, zato jih ne prepisuje. Bere le UTF-8 besedilo do 32 KiB, seznam pa omeji na 200 vnosov. V dnevnik shrani identifikator, čas, tip in stanje opravila, brez žetona, vprašanja ali vsebine datoteke.

To je lokalni prototip z zaupanja vrednim lastnikom dovoljenih map. Preverjanje povezav ni operacijski peskovnik in ne zagotavlja zaščite pred drugim lokalnim procesom, ki med preverjanjem spreminja mape. Pred širšo distribucijo je treba obravnavati te tekmovalne pogoje, sistemska dovoljenja, omejevanje virov in zagon procesa z najmanjšimi pravicami. Brisanje, prepisovanje, poljubni programi in ukazi ter samodejno upravljanje drugih aplikacij v tej različici niso podprti.

## Razvojno okolje in repozitorij

Obstoječi skupni repozitorij je [DukatKefir/RPS-C-LazarVozeljLaporsek](https://github.com/DukatKefir/RPS-C-LazarVozeljLaporsek). Backend se nahaja v podmapi `Nejc`, zato je ločen od dela drugih članov. Pripravljene so izvorne datoteke, primer konfiguracije, datoteka zaklenjenih paketov, testi, API pogodba in odjemalec za glavni namizni proces. Spremembe so lokalne; objava na oddaljenem repozitoriju še ni izvedena.

Za zagon uporabi Node.js 24.x in Ollama, nato v mapi `Nejc` izvedi `npm ci`, `npm run setup:local` in `npm start`. V drugem terminalu `npm run chat` odpre pogovor. Navodila so v `README.md`. Razvojni zagon je `npm run dev`, preverjanje sintakse `npm run check`, avtomatizirani testi pa `npm test`. `npm run verify:local` preveri dejanski model, spomin in datotečna opravila v začasni mapi. Za ekipne spremembe je priporočena veja `codex/desktop-buddy-backend` in pregled sprememb pred združitvijo v `main`; veja v tem koraku še ni ustvarjena.

## Tedenski načrt in merila uspeha

| Dan | Backend naloga | Merilo uspeha |
| --- | --- | --- |
| 1 | obseg, tehnologija, struktura in konfiguracija | projekt se zažene in `/health` odgovori |
| 2 | nadzorovani worker CMD in datotečna opravila | nastane UTF-8 datoteka znotraj dovoljene mape |
| 3 | planer in možnost povezave Ollama | demo ukazi delujejo, izhod modela se validira |
| 4 | API pogodba, stanja lika in odjemalec | frontend lahko pošlje `hover`, `leave` in vprašanje |
| 5 | testi, pregled in dokumentacija | preverjene napake in navodila za člane ekipe |

Pripravljena osnova pokriva backend naloge prototipa. Avtomatizirani testi preverjajo datoteke prek CMD na Windows, šumnike, prepisovanje, izhode iz mape, junction povezave, avtorizacijo, velikost zahtev, spomin pogovora, dodatne dovoljene mape in zavrnitev oblačnih modelov. Namizni zagoni so v avtomatiziranih testih nadomeščeni, da ne odpirajo oken. Povezava z modelom je v testih simulirana; dejansko lokalno namestitev preveri `npm run doctor` in nato pogovor z `npm run chat`.

Vseh 13 avtomatiziranih testov uspešno prestane. Na razvojnem računalniku sta nameščena Ollama in lokalni Qwen3 8B. Ločen preizkus z dejanskim modelom je potrdil običajen pogovor, nadaljevanje s pomnjenjem imena ter ustvarjanje in branje testne datoteke. Nastavitve vsebujejo lokalne mape za namizje, dokumente in prenose. Pogovori in opravila ne potrebujejo plačljivega API-ja.

Tedenski rezultat je tehnični načrt, izbrana backend tehnologija, pripravljeno lokalno razvojno okolje in delujoča backend osnova. Naslednji ekipni korak je povezava z namiznim vmesnikom ter meritev dejanskega modela na ciljnem računalniku. Paket za končnega uporabnika in animirani lik še nista izdelana.

## Tehnični viri

- [Node.js podprocesi](https://nodejs.org/api/child_process.html) opisujejo `spawn`, argumente in vedenje lupine.
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) opisuje ločitev konteksta in omejene preload metode.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/) določa priporočila za renderer in preverjanje IPC.
- [Ollama structured outputs](https://ollama.com/blog/structured-outputs) opisuje JSON shemo za strukturirane odgovore.
