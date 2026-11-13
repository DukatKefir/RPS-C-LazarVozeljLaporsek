# Lokalni Desktop Buddy backend

Backend za namiznega prijatelja v slogu Clippyja. Z njim se lahko pogovarjaš o običajnih stvareh, nadaljuješ prejšnji pogovor ter ga prosiš, naj ustvari datoteko, odpre mapo ali zažene Kalkulator. Jezikovni model deluje na tvojem računalniku prek **Ollama**. Ni plačljivih API-jev, ključev ponudnikov ali obvezne prijave.

To je Nejčev backend del projekta. Lik, prosojno okno ob opravilni vrstici in animacije implementira frontend ekipa. Za preizkus pogovora je že priložen terminalski odjemalec.

## Zagon na Windows

Potrebuješ **Node.js 24.x** in brezplačno [Ollama](https://ollama.com/download). Ollama lahko namestiš tudi z:

```powershell
winget install --id Ollama.Ollama --exact --scope user
```

Nato v mapi `Nejc`:

```powershell
npm ci
npm run setup:local
npm start
```

`setup:local` prenese lokalni model **Qwen3 8B**, preveri, da model ni oblačni, pripravi `.env` z naključnim lokalnim žetonom in doda zaznane mape `namizje`, `dokumenti`, `prenosi`. Model ima približno 5,2 GB prenosa; potrebuješ še pomnilnik za izvajanje. Prvi prenos potrebuje internet, običajen pogovor po namestitvi deluje brez njega. Glej [podatke in licenco modela](https://ollama.com/library/qwen3:8b).

V drugem terminalu v isti mapi zaženi:

```powershell
npm run chat
```

Primeri sporočil:

- »Živjo, ime mi je Nejc.« in nato »Kako mi je ime?«
- »Razloži mi razliko med RAM in diskom.«
- »Ustvari datoteko ideja.txt z vsebino Moj prvi projekt.«
- »Odpri dokumente.«
- »Kaj je v mapi prenosi?«
- »Preberi datoteko ideja.txt.«
- »Odpri kalkulator.«

Z `/nov` začneš nov pogovor, z `/izhod` zapreš odjemalca. `npm run doctor` preveri dostopnost lokalnega modela. `npm start` pusti backend v ločenem terminalu; terminalski pogovor zahteva, da backend teče.

## Podprta opravila

| Opravilo | Kaj naredi |
| --- | --- |
| `create_file` | ustvari UTF-8 datoteko in po potrebi nadrejene mape |
| `create_directory` | ustvari mapo |
| `open_directory` | pošlje zahtevo Raziskovalcu za odpiranje mape |
| `list_directory` | vrne največ 200 vnosov v mapi |
| `read_file` | prebere besedilno datoteko UTF-8 do 32 KiB |
| `open_app` | zažene Beležnico ali Kalkulator |

Buddy opravi eno opravilo na sporočilo. Deluje v `workspace/` in dodatnih mapah, ki jih nastavi lokalni uporabnik. Obstoječih datotek ne prepisuje. Brisanje, poljubni sistemski ukazi in samodejno klikanje po drugih aplikacijah še niso vključeni.

Pogovor ima spomin v pomnilniku backend procesa: do 20 zadnjih izmenjav, največ 50 pogovorov. Količina zgodovine se prilagodi kontekstu modela (pri `BUDDY_OLLAMA_NUM_CTX=4096` približno 6.000 znakov, pri 8192 približno 18.000). Pri daljših pogovorih najstarejša sporočila odpadejo, pogovori brez aktivnosti 30 minut pa se izbrišejo. Vsebina posameznega odgovora je v spominu omejena na 12.000 znakov. Ob ponovnem zagonu se zgodovina izbriše; na disk se pogovori ne shranjujejo.

## Lokalno izvajanje

Backend dostopa samo do lokalnega naslova Ollama in ne sledi preusmeritvam. Pred vsakim klicem modela preveri metapodatke ter zavrne oblačne modele. Noben del backenda ne kliče plačljivega ponudnika. Za izklop oblačnih funkcij tudi v samostojni aplikaciji Ollama nastavi `OLLAMA_NO_CLOUD=1` v uporabniških okoljskih spremenljivkah Windows in ponovno zaženi Ollama, kot opisuje [uradni FAQ](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features). Če nastavitveni skript sam zažene strežnik Ollama, to spremenljivko nastavi za ta proces.

Model izbira preverjena opravila. Datotečna opravila gredo prek skritega procesa CMD, ki zažene fiksen Node worker. Uporabniške poti in vsebina potujejo po standardnem vhodu, ne kot ukaz lupine. Beležnica, Kalkulator in Raziskovalec se zaženejo neposredno z ločenimi argumenti. `launched` pomeni, da je Windows sprejel zagon procesa; backend ne preverja, ali se je okno prikazalo na zaslonu.

## Nastavitve

`setup:local` ustvari `.env`; ročno lahko izhajaš iz `.env.example`. `.env` je izključen iz Gita.

```dotenv
BUDDY_PORT=43123
BUDDY_WORKSPACE=./workspace
BUDDY_DATA=./data
BUDDY_AI_PROVIDER=ollama
BUDDY_OLLAMA_URL=http://127.0.0.1:11434
BUDDY_OLLAMA_MODEL=qwen3:8b
BUDDY_OLLAMA_NUM_CTX=4096
BUDDY_OLLAMA_KEEP_ALIVE=2m
BUDDY_FOLDERS='{"dokumenti":"C:/Users/Nejc/Documents","prenosi":"C:/Users/Nejc/Downloads"}'
```

Poti v `BUDDY_FOLDERS` so primeri: uporabi svoje obstoječe lokalne mape. Alias `workspace` je rezerviran. Za nove nastavitve ponovno zaženi backend. Za druge lokalne modele nastavi `BUDDY_OLLAMA_MODEL` pred zagonom `setup:local`; podprt je lokalni format GGUF in strukturiran JSON odgovor. Hitrost ter kakovost slovenščine sta odvisni od modela in strojne opreme.

### Poraba pomnilnika

Največ RAM-a porabi lokalni model, ne backend. Izmerjeno na tem računalniku (model v celoti v RAM-u):

| Nastavitev | RAM modela |
| --- | --- |
| `qwen3:8b`, kontekst 8192 (prej) | 6,22 GB |
| `qwen3:8b`, kontekst 4096 (privzeto) | 5,54 GB |
| `qwen3:4b`, kontekst 4096 | 2,97 GB |

- `BUDDY_OLLAMA_NUM_CTX` določa kontekst (večji = daljši spomin in več RAM-a).
- `BUDDY_OLLAMA_KEEP_ALIVE` določa, kako dolgo ostane model naložen po zadnjem sporočilu (privzeto `2m`, prej `5m`; `0` = takoj sprosti, a vsak odgovor traja dlje).
- Ob zaustavitvi backenda (Ctrl+C) se model takoj sprosti iz pomnilnika.
- Če Ollamo zažene `setup:local`, vklopi tudi `OLLAMA_FLASH_ATTENTION=1` in `OLLAMA_KV_CACHE_TYPE=q8_0`, kar dodatno zmanjša pomnilnik konteksta. Za samostojno aplikacijo Ollama ju lahko nastaviš v uporabniških okoljskih spremenljivkah Windows.
- `npm start` zažene Node z manjšo kopico (`--max-old-space-size=64 --lite-mode`); vsak delavec za opravila ima omejitev 32 MB.

Za računalnik z manj pomnilnika lahko uporabiš `qwen3:4b` (približno 2,5 GB prenosa). Na tem računalniku sta nameščena oba modela, izbran je `qwen3:8b`; manjši model lahko slabše oblikuje slovenske stavke.

Za preizkus brez nameščenega modela nastavi `BUDDY_AI_PROVIDER=mock`. Ta način ne omogoča prostega pogovora, podpira pa neposredna opravila in ukaze:

```text
/ustvari "zapiski/ideja.txt" "Pozdravljen"
/mapa "zapiski/nov"
/odpri "dokumenti"
/seznam "prenosi"
/preberi "zapiski/ideja.txt"
/aplikacija kalkulator
```

## Razvoj in povezava s frontend delom

```powershell
npm run dev
npm run check
npm test
```

Projekt nima zunanjih npm odvisnosti. Testi preverijo datotečna opravila v procesu CMD, spomin pogovora, izolacijo pogovorov, omejitve datotek, validacijo poti, zaščito pred oblačnimi modeli in lokalni API. Namizni zagoni se v avtomatiziranih testih nadomestijo s testnim izvajalnikom, da testi ne odpirajo oken. Lokalni API in Windows junction test potrebujeta dovoljenja, ki jih omejen peskovnik lahko blokira.

Glavni Electron proces hrani žeton in kliče backend, renderer pa dobi omejene metode prek preload vmesnika. Priložen odjemalec sam ustvari `conversationId`, zato lahko vsako pogovorno okno ohranja svoj kontekst. Nastavitve lika: `hover`, `leave`, `peeking`, `visible`, `thinking` in zadnji izid opravila.

- [Pogodba API](../Porocila/Pogodba_API.docx)
- [Odjemalec za glavni proces](examples/backend-client.js)
- [Tehnični načrt](../Porocila/Tehnicni_nacrt.docx)
- [Poročilo o backendu](../Porocila/Porocilo_Buddy_backend.docx)
- [Skupni GitHub repozitorij](https://github.com/DukatKefir/RPS-C-LazarVozeljLaporsek)

Mapa `src/` vsebuje API, planer, lokalnega AI ponudnika in izvajalnike opravil. `scripts/` vsebuje pripravo lokalnega modela, diagnostiko in terminalski pogovor. Dnevnik `data/audit.jsonl` hrani čas, identifikator, tip in stanje opravila, brez besedila pogovorov ali vsebine datotek.

## Spletna stran

Spletna stran z registracijo in prijavo je v sosednji mapi [`../Website`](../Website) (PHP + SQLite). Poročila in dokumentacija (Word) so v [`../Porocila`](../Porocila).
