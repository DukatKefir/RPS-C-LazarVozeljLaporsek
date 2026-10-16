# Pogodba API za Desktop Buddy

Osnovni naslov: `http://127.0.0.1:43123`. Vsaka zahteva, tudi `/health`, potrebuje glavo `Authorization: Bearer <BUDDY_TOKEN>`. POST zahteve morajo vsebovati `Content-Type: application/json`. Največje telo zahteve je 64 KiB.

API je namenjen glavnemu procesu namizne aplikacije. Zahteve z glavo `Origin` so zavrnjene. Renderer naj kliče preverjene IPC metode v Electron glavnem procesu. CORS ni omogočen.

## Končne točke

| Metoda in pot | Vhod | Odgovor |
| --- | --- | --- |
| `GET /health` | brez telesa | `{ "status": "ok" }` |
| `GET /buddy` | brez telesa | `{ "state": "peeking", "busy": false, "lastOutcome": null }` |
| `GET /capabilities` | brez telesa | dovoljeni tipi opravil, aplikacije in imena map |
| `GET /ai/status` | brez telesa | stanje preverjenega lokalnega modela ali napaka 502 |
| `POST /buddy/events` | `{ "event": "hover" }` ali `{ "event": "leave" }` | trenutno stanje lika |
| `POST /chat` | `{ "message": "...", "conversationId": "moj-pogovor" }` | odgovor, rezultat opravila in `conversationId` |
| `POST /chat/reset` | `{ "conversationId": "moj-pogovor" }` | `{ "conversationId": "moj-pogovor", "status": "cleared" }` |
| `POST /actions` | objekt opravila spodaj | rezultat opravila |

Besedilo sporočila lahko vsebuje največ 8000 znakov. Primer brez AI:

```json
{ "message": "/ustvari \"zapiski/ideja.txt\" \"Pozdravljen\"" }
```

Za neposredno opravilo:

```json
{ "type": "create_file", "path": "zapiski/ideja.txt", "content": "Pozdravljen" }
```

```json
{ "type": "create_directory", "path": "zapiski/nova-mapa" }
```

`path` je vedno relativna pot pod `BUDDY_WORKSPACE`, z ločilom `/`. Za drugo dovoljeno osnovno mapo uporabnik spremeni konfiguracijo in ponovno zažene backend. Vsebina datoteke je UTF-8, največ 32 KiB. Manjkajoče nadrejene mape se ustvarijo samodejno. Obstoječa datoteka se ne prepiše, obstoječa navadna mapa pa se šteje kot uspešno pripravljena.

Datotečna opravila imajo tudi neobvezen `folder`, ki izbere eno od map v `BUDDY_FOLDERS`; privzeto je `workspace`. Backend modelu posreduje samo dovoljena imena map. Absolutne poti prek API niso dovoljene. Za korensko mapo pri `open_directory` ali `list_directory` uporabi `path: "."`.

```json
{ "type": "open_directory", "folder": "dokumenti", "path": "." }
```

```json
{ "type": "list_directory", "folder": "prenosi", "path": "." }
```

```json
{ "type": "read_file", "path": "ideja.txt" }
```

```json
{ "type": "open_app", "app": "calculator" }
```

`open_app` dovoli samo `notepad` in `calculator`, brez dodatnih argumentov. `open_directory` in `open_app` vrneta `status: "launched"`: zahteva za zagon je bila poslana Windows, vidnost okna ni preverjena. `read_file` vrne tudi `content`; `list_directory` vrne `entries` z `name` in `type` ter `truncated`. Seznam je omejen na 200 vnosov, branje na 32 KiB UTF-8 besedila. Binarne datoteke in povezave so zavrnjene.

## Običajen pogovor in spomin

Privzeti ponudnik je lokalni Ollama z modelom `qwen3:8b`. Pri običajnem pogovoru je `action: null`, v `reply` pa naravni odgovor. Pred vsako zahtevo modelu backend prek `/api/show` preveri lokalni GGUF model in odsotnost oddaljenega gostitelja. Ni oblačnega nadomestnega ponudnika ali plačljivega API-ja. Za model je omejitev 120 sekund, preverjanje metapodatkov pa ima svojo omejitev 15 sekund.

`conversationId` je neobvezen, vsebuje 1 do 64 črk ASCII, številk, `_` ali `-`. Privzeta vrednost je `default`. Za vsako pogovorno okno uporabi ločen identifikator. Odjemalec v `examples/backend-client.js` ga ustvari sam. Odgovor vrne isti identifikator. Backend hrani do 20 izmenjav oziroma 24.000 znakov, največ 50 pogovorov v pomnilniku. Dolgi odgovori se v spominu omejijo na 12.000 znakov. Ponovni zagon ali `/chat/reset` zgodovino izbriše. Zgodovina se ne piše na disk.

Pri nadaljevanju pogovora model prejme prejšnja uporabniška sporočila in dejanske rezultate opravil. Ob napaki zgodovina vsebuje napako, ne obljube o uspehu. Hkratna ponastavitev med opravilom je zavrnjena s 409. Identifikator loči kontekst, ni uporabniški račun ali ločena avtorizacijska meja.

Primer uspešnega odgovora za `/chat`:

```json
{
  "reply": "Ustvarjeno: zapiski/ideja.txt",
  "action": {
    "id": "identifikator-opravila",
    "type": "create_file",
    "path": "zapiski/ideja.txt",
    "status": "completed"
  }
}
```

Pri `/actions` je vrnjen samo objekt opravila. Če po uspešni izvedbi ne uspe zapis zaključka v dnevnik, rezultat ohrani `status: completed` oziroma `launched` in doda `warning`; opravila zato ne ponavljaj samodejno.

## Stanje lika in miška

Frontend sam zazna prehod miške nad likom in pošlje `hover`; backend vrne `visible`, frontend pa predvaja skok. Ob `leave` vrne `peeking`. Med obdelavo je stanje `thinking`, ne glede na miško. Po zaključku se vrne v stanje glede na zadnji dogodek miške. `lastOutcome` je `null`, `success` ali `error`.

`/chat` in `/actions` odgovorita po zaključku, zato frontend takoj ob oddaji pokaže stanje obdelave in ga zaključi ob prejemu odgovora. Po potrebi lahko glavni proces vmes bere `/buddy`. WebSocket ali streaming v prvi različici ni vključen. Hkrati je dovoljeno eno opravilo; druga zahteva prejme 409.

## Napake

Telo napake je `{ "error": "opis" }`.

| Status | Pomen |
| --- | --- |
| 400 | neveljaven vhod, nedovoljena pot ali opravilo |
| 401 | manjkajoč ali napačen žeton |
| 403 | spletni izvor ali nedovoljen Host |
| 404 | neznana pot, metoda, datoteka ali mapa |
| 409 | datoteka obstaja, delovna mapa se je spremenila ali je backend zaseden |
| 413 | preveliko telo zahteve |
| 415 | napačen Content-Type |
| 500 | napaka lokalnega datotečnega sistema ali izvajalnika |
| 501 | namizno opravilo na nepodprtem operacijskem sistemu |
| 502 | Ollama ni dosegljiva ali je odgovor neveljaven |

Ob prekinitvi povezave je izid lahko neznan: opravilo se lahko še vedno zaključi. Najprej preveri ustvarjeno datoteko ali dnevnik. Idempotency ključi in preklic opravil so predvideni za nadaljnji razvoj.

## Integracija v Electron

Primer odjemalca je `examples/backend-client.js`. Glavni proces kliče `client.chat(message)`, `client.hover()` in `client.leave()`. Preload naj izpostavi eno omejeno metodo za vsako dovoljeno dejanje. Nastavi `contextIsolation: true`, `nodeIntegration: false` in `sandbox: true` ter preverjaj pošiljatelja IPC sporočil. Poljubnega IPC kanala ali sistemske lupine ne izpostavi rendererju.

Viri: [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/).
