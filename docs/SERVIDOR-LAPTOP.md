# PvP Island en la laptop de casa (gratis)

Esta guía es para mamá, papá u otro adulto. **No hace falta saber programar.**
Solo hay que copiar y pegar los comandos que están en los cuadros grises.

Cuando una parte es distinta en **Windows** y en **Mac**, hay dos listas: siga solo la de su computadora.

> **Cómo abrir la ventana de comandos** (la va a usar muchas veces):
> - **Windows:** botón Inicio, escriba `cmd` y abra **Símbolo del sistema**.
> - **Mac:** pulse **Cmd + Espacio**, escriba `Terminal` y pulse Enter.
>
> Para pegar un comando: **Windows** clic derecho (o Ctrl+V); **Mac** Cmd+V. Después pulse **Enter**.

---

## a) Qué es el servidor

El "servidor" es el programa que hace funcionar la isla: guarda las cuentas, las monedas y las armas, y une a
todos los jugadores en la misma partida. Esta guía lo pone en **su laptop**. Mientras la laptop esté encendida
con el juego abierto, los amigos pueden jugar desde sus casas con un enlace, **sin pagar ningún servidor**.

---

## b) Instalar Node.js y Git (una sola vez)

**Windows**

1. Vaya a **https://nodejs.org**, descargue la versión **LTS** (el botón verde) e instálela
   (Siguiente, Siguiente... deje todo como está).
2. Vaya a **https://git-scm.com**, pulse **Download for Windows** e instálelo (deje todo como está).
3. Abra una ventana de comandos **nueva** y compruebe que todo está bien:

   ```
   node --version
   git --version
   ```

   Deben aparecer dos números (por ejemplo `v22...` y `git version 2...`).

**Mac**

1. Vaya a **https://nodejs.org**, descargue la versión **LTS** (el archivo `.pkg`) e instálela.
2. Abra la Terminal y escriba:

   ```
   git --version
   ```

   Si el Mac pregunta si quiere instalar las "herramientas de línea de comandos", pulse **Instalar** y espere.
   (Si ya usa Homebrew, también sirve `brew install node git`. No es obligatorio.)
3. Compruebe:

   ```
   node --version
   git --version
   ```

---

## c) Bajar el juego (una sola vez)

El código del juego está en GitHub. Si el repositorio es **privado**, necesita entrar con la cuenta de GitHub
que tiene acceso al juego (la del niño o la suya, si él le dio acceso).

**Opción fácil: GitHub Desktop (Windows y Mac)**

1. Descargue **GitHub Desktop** en **https://desktop.github.com** e instálelo.
2. Ábralo y entre con la cuenta de GitHub (**Sign in to GitHub.com**).
3. Menú **File → Clone repository**, elija **pvp** de la lista y pulse **Clone**.
   GitHub Desktop le dice en qué carpeta lo guarda (normalmente `Documentos\GitHub\pvp`).
4. Abra la ventana de comandos y entre en esa carpeta:
   - **Windows:**

     ```
     cd %USERPROFILE%\Documents\GitHub\pvp
     ```

   - **Mac:**

     ```
     cd ~/Documents/GitHub/pvp
     ```

5. Instale lo que el juego necesita (tarda un minuto):

   ```
   npm install
   ```

**Opción con comandos**

1. En la ventana de comandos:

   ```
   git clone https://github.com/henriquemedeiros23-dev/pvp.git
   cd pvp
   npm install
   ```

2. Si el repositorio es privado, Git pide entrar en GitHub. En **Windows** se abre una ventana o el navegador
   para iniciar sesión: entre y vuelva a la ventana de comandos. En **Mac**, si pide "Password", GitHub no acepta
   la contraseña normal: es más fácil usar **GitHub Desktop** (arriba).

La carpeta del juego queda en `pvp` dentro de su carpeta personal (Windows: `cd %USERPROFILE%\pvp`, Mac: `cd ~/pvp`).

---

## d) Encender el juego

1. Abra la ventana de comandos y entre en la carpeta del juego (paso c, `cd ...`).
2. Escriba:

   ```
   npm run serve
   ```

3. Aparece algo así:

   ```
   === PvP Island: servidor en esta laptop ===
   Cuentas guardadas en: C:\Users\Ana\pvp-island-data
   ...
   PvP Island is running!
     On this computer:  http://localhost:3000
     On phones (same Wi-Fi): http://192.168.1.23:3000
   ```

   **Deje esta ventana abierta** mientras juegan. Si la cierra, el juego se apaga.
4. **Probar en la laptop:** abra el navegador en **http://localhost:3000**. Cree una cuenta y juegue un poco.
5. **Probar en un teléfono de la misma Wi-Fi:** en el teléfono abra la dirección de la línea
   `On phones (same Wi-Fi)` (por ejemplo `http://192.168.1.23:3000`).
6. **La primera vez:**
   - **Windows** muestra un aviso del Firewall para "Node.js". Marque **Redes privadas** y pulse **Permitir acceso**.
     (Su Wi-Fi de casa debe estar como red **privada**: Configuración → Red e Internet → Wi-Fi → su red → **Red privada**.)
   - **Mac** puede preguntar si "node" puede aceptar conexiones entrantes: pulse **Permitir**.

Las cuentas se guardan en una carpeta llamada **`pvp-island-data`** en su carpeta personal
(Windows: `C:\Users\<su nombre>\pvp-island-data`, Mac: `/Users/<su nombre>/pvp-island-data`).
Está **fuera** de la carpeta del juego a propósito: así no se pierden si borra o vuelve a bajar el juego.

---

## e) Jugar por internet con Cloudflare Tunnel

Los amigos que están **en sus casas** no pueden usar la dirección de la Wi-Fi. Para ellos, Cloudflare (gratis)
hace un "túnel": un enlace `https://...` que lleva a su laptop **sin abrir nada en el router** y sin mostrar la
dirección de su casa.

### Instalar cloudflared (una sola vez)

- **Windows:** en la ventana de comandos:

  ```
  winget install --id Cloudflare.cloudflared
  ```

  (Si `winget` no existe, descargue el instalador `.msi` para Windows desde
  **https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/**.)
  Después **cierre la ventana y abra una nueva**.
- **Mac:** con Homebrew:

  ```
  brew install cloudflared
  ```

  (Sin Homebrew: descargue la versión para macOS en la misma página de Cloudflare de arriba.)

Compruebe con `cloudflared --version`.

### Prueba rápida (sin cuenta, sin configurar nada)

1. El juego tiene que estar encendido (paso d) en su ventana.
2. Abra **otra** ventana de comandos (no cierre la del juego) y escriba:

   ```
   cloudflared tunnel --url http://localhost:3000
   ```

3. Después de unos segundos aparece un recuadro con un enlace como
   **`https://palabras-al-azar.trycloudflare.com`**. Ese es el enlace para los amigos: ábralo primero usted
   para comprobar que sale el juego, y luego compártalo.
4. **El enlace cambia cada vez** que se vuelve a escribir el comando. Cloudflare dice que este modo es para
   pruebas; para jugar seguido es mejor la dirección fija (abajo), pero si no tienen dominio pueden seguir usando
   este sin problema.

### Dirección fija con la cuenta de Cloudflare del papá

Así el enlace es siempre el mismo (por ejemplo `https://pvp.sudominio.com`). **Hace falta un dominio** (un nombre
de sitio web) añadido a esa cuenta de Cloudflare. Un dominio **se paga cada año** y es **opcional**; si no tienen
uno, usen la prueba rápida de arriba.

1. Entre en **https://dash.cloudflare.com** con la cuenta del papá.
2. Abra **Zero Trust** (en el menú de la izquierda). Si es la primera vez, Cloudflare pide elegir un nombre de
   equipo y el plan **Free** (gratis).
3. Vaya a **Networks → Tunnels** y pulse **Create a tunnel**.
4. Elija **Cloudflared**, ponga un nombre (por ejemplo `pvp-laptop`) y pulse **Save tunnel**.
5. Cloudflare muestra cómo instalar el conector. Elija **Windows** o **macOS** según su laptop y **copie el
   comando** que aparece (contiene una clave larga; no la comparta con nadie):
   - **Windows:** abra el Símbolo del sistema **como administrador** (Inicio, escriba `cmd`, clic derecho →
     **Ejecutar como administrador**), pegue el comando y pulse Enter.
   - **Mac:** pegue el comando en la Terminal. Si empieza con `sudo`, le pide la contraseña del Mac
     (al escribirla no se ve nada, es normal).
   Abajo en la página el conector debe aparecer como **Connected**. Pulse **Next**.
6. En **Public Hostname** (en algunas cuentas se llama **Published application routes**):
   - **Subdomain:** `pvp`
   - **Domain:** su dominio (por ejemplo `sudominio.com`)
   - **Service → Type:** `HTTP`
   - **URL:** `localhost:3000`
7. Pulse **Save**. Después de un minuto, **https://pvp.sudominio.com** abre el juego (si el juego está encendido).

Los **WebSockets** (lo que usa el juego para moverse en tiempo real) funcionan sin tocar nada más.
Con este método el túnel arranca solo con la laptop: ya no hace falta la segunda ventana. Si el juego está
apagado, el enlace muestra un error de Cloudflare: encienda el juego (paso d).

---

## f) Mantener la laptop despierta

Si la laptop se duerme, el juego se corta para todos.

- Déjela **enchufada al cargador** y con la **tapa abierta** (al cerrar la tapa se duerme).
- **Windows:** Configuración → **Sistema → Energía y batería** (o **Energía**) → **Pantalla y suspensión** →
  "Cuando esté enchufado, suspender el equipo después de": **Nunca**.
- **Mac:** abra **otra** Terminal y escriba:

  ```
  caffeinate -dims
  ```

  Mientras esa ventana esté abierta, el Mac no se duerme (Ctrl+C la detiene). También se puede en
  **Ajustes del Sistema → Batería → Opciones**: activar **"Evitar el reposo automático con el adaptador de
  corriente cuando la pantalla está apagada"**.

---

## g) Apagar

1. En la ventana del túnel (si usa la prueba rápida): pulse **Ctrl+C**.
2. En la ventana del juego: pulse **Ctrl+C**. Aparece `Accounts saved`: **las cuentas quedan guardadas**.
   En Windows puede preguntar `¿Desea terminar el trabajo por lotes (S/N)?`: escriba **S** y Enter.

Los jugadores que estaban en una partida recuperan las cosas de su barra.

---

## h) Actualizar el juego

Cuando el niño dice que hay una versión nueva:

1. En la ventana del juego pulse **Ctrl+C** (paso g).
2. Escriba, uno por uno:

   ```
   git pull
   npm install
   npm run serve
   ```

   (Con **GitHub Desktop** también puede pulsar **Fetch origin** y luego **Pull origin**, y después
   `npm install` y `npm run serve` en la ventana de comandos.)

Las cuentas no se pierden: están en `pvp-island-data`, fuera de la carpeta del juego.

---

## i) Copias de seguridad y reinicio del día del lanzamiento

**Copias automáticas:** cada día, mientras el juego está encendido, se guarda una copia de las cuentas en la
misma carpeta `pvp-island-data` (se guardan las últimas 7). Para abrir la carpeta:

- **Windows:**

  ```
  explorer %USERPROFILE%\pvp-island-data
  ```

- **Mac:**

  ```
  open ~/pvp-island-data
  ```

De vez en cuando copie esa carpeta entera a un USB o a la nube (Google Drive, iCloud, OneDrive...).

**Reinicio del día del lanzamiento** (borra **todas** las cuentas para que todos empiecen igual).
**Hágalo solo cuando el niño lo pida.** Antes se guarda una copia automáticamente.

1. Con el juego encendido o apagado, en una ventana de comandos dentro de la carpeta del juego:

   ```
   npm run admin:reset-laptop -- --yes
   ```

   Responde `All accounts wiped ...` y el nombre de la copia (`accounts.json.before-reset-...`).
2. Si el juego estaba encendido: **Ctrl+C** en su ventana y vuelva a escribir `npm run serve`.
   Este paso es importante: al arrancar de nuevo se borra otra vez, por si el juego volvió a guardar a todos al apagarse.
3. Compruebe: entrar con una cuenta vieja dice que el nombre o la contraseña están mal.

(El comando `npm run admin:reset-accounts` de la otra guía es para servidores en internet; en la laptop use
`admin:reset-laptop`, que borra la carpeta correcta.)

---

## j) Seguridad

- **Solo se comparte el juego.** El túnel lleva a los jugadores únicamente a la página del juego (puerto 3000).
  Nadie puede ver los archivos, fotos ni documentos de la laptop.
- **La dirección de su casa queda oculta.** Los amigos ven una dirección de Cloudflare, no la IP de su casa, y
  no hay que abrir puertos en el router.
- **Quién puede jugar:** **cualquiera que tenga el enlace.** Compártalo solo con amigos (no en redes sociales
  públicas). Para dejar de compartir: cierre el túnel (Ctrl+C en su ventana); con la dirección fija, borre o
  detenga el túnel en Cloudflare (Zero Trust → Networks → Tunnels).
- **El juego ya se protege solo:** no tiene chat, filtra los nombres feos, guarda las contraseñas cifradas,
  no guarda correos ni nombres reales, y limita los intentos de contraseña, las cuentas nuevas y las conexiones
  **por cada jugador** (con `npm run serve` el juego reconoce la dirección real de cada amigo que llega por Cloudflare).
- **Nunca** encienda el juego con `PVP_TEST_HOOKS` (es solo para las pruebas automáticas; regala monedas).
  `npm run serve` se niega a arrancar si está puesto.
- **Mantenga la laptop actualizada** (Windows Update / Actualización de software del Mac) y con contraseña de usuario.

---

## k) Problemas comunes

| Problema | Qué hacer |
|---|---|
| `Port 3000 is already in use` | El juego ya está abierto en otra ventana: búsquela y ciérrela con Ctrl+C, o reinicie la laptop. |
| `npm` o `node` "no se reconoce" | Cierre la ventana de comandos y abra una nueva. Si sigue, vuelva a instalar Node.js (paso b). |
| El teléfono no conecta (misma Wi-Fi) | Use la dirección de `On phones (same Wi-Fi)` con `http://` y `:3000`. El teléfono debe estar en la **misma** Wi-Fi (no en datos móviles ni en la Wi-Fi de invitados). En Windows: la red debe ser **privada** y Node.js permitido en el Firewall (Panel de control → Firewall de Windows Defender → **Permitir una aplicación** → marque Node.js en **Privada**). |
| El enlace `trycloudflare.com` dejó de funcionar | Ese enlace cambia cada vez. Compruebe que las dos ventanas siguen abiertas; si no, vuelva a escribir `cloudflared tunnel --url http://localhost:3000` y comparta el enlace **nuevo**. |
| El enlace fijo muestra un error de Cloudflare (502 / 1033) | El juego está apagado o la laptop está dormida o sin internet. Encienda el juego (`npm run serve`). En Zero Trust → Tunnels el túnel debe decir **Healthy**. |
| A todos se les cortó el juego | La laptop se durmió o perdió el Wi-Fi. Vea el paso f, y vuelva a encender el juego y el túnel. |
| "The island is very busy" | Demasiadas conexiones desde la misma casa o escuela (más de 20). Cierren pestañas que no usen. |
| `npm install` da errores | Compruebe que tiene internet y que Node.js es la versión LTS. Escriba `npm install` otra vez. |

### Si los botones no hacen nada en Windows

Antes (issue #58), en algunas laptops con Windows los botones **Log in** y **Create account** no hacían nada
(la página se recargaba y los cuadros quedaban vacíos). La causa: Git para Windows guardaba los archivos con otro
tipo de fin de línea (CRLF) y el navegador bloqueaba el código del juego.

- **Ya está arreglado.** Actualice el juego (paso h: `git pull`, `npm install`, `npm run serve`) y recargue la página.
- Si después de actualizar todavía no funciona (o `git pull` se queja de cambios), en la carpeta del juego escriba,
  uno por uno (las cuentas no se pierden, están en `pvp-island-data`):

  ```
  git config core.autocrlf false
  git config core.eol lf
  git rm --cached -r -q .
  git reset --hard HEAD
  ```

  Luego vuelva a encender el juego (`npm run serve`).
- Si el juego no puede cargar, ahora la pantalla de cuenta lo dice: *"The game could not load. Check your internet
  and reload the page."* Revise el internet y recargue la página.
