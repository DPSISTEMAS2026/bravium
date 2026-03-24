# # Guía de Despliegue con Dominio Propio (`braviumhub.com`)

Si el equipo de Bravium va a apuntar su dominio **`braviumhub.com`** (o un subdominio como `contabilidad.braviumhub.com`) a tu servidor, el proceso es mucho más sencillo y limpio porque operará en la **raíz (`/`)** del dominio.

---

## 1. Configuración de DNS (Acción para Bravium)

El equipo de Bravium debe crear un registro **A** en su panel de dominio que apunte a la **IP Pública de tu Servidor**.

*   **Tipo:** A
*   **Nombre:** `@` (para braviumhub.com) o `contabilidad` (para contabilidad.braviumhub.com)
*   **Valor:** `IP_DE_TU_SERVIDOR`

---

## 2. Configuración del Servidor (Nginx en tu servidor)

Nginx debe escuchar el tráfico de ese dominio en específico y redirigirlo (Reverse Proxy) a los puertos donde corren tus aplicaciones de Node.js.

### 📄 Configuración de Nginx Sugerida:

```nginx
server {
    listen 80;
    server_name braviumhub.com; # <-- Dominio de ellos

    # --- FRONTEND (Next.js en puerto 3001) ---
    location / {
        proxy_pass http://localhost:3001; 
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # --- BACKEND API (NestJS en puerto 3000) ---
    # Usaremos /api/ para que no choque con las rutas de Next.js
    location /api/ {
        proxy_pass http://localhost:3000/; # <-- Nota el slash final
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> 💡 **Nota de Seguridad y SSL:** Una vez Nginx empiece a responder a `braviumhub.com`, deberás correr `certbot` en tu servidor para instalarle el certificado SSL (HTTPS) de forma gratuita para ese dominio.

---

## 3. Instrucciones para enviar a **Bravium**

Para que ellos puedan integrarse y usar la plataforma, debes enviarle el siguiente correo o documento instructivo resumido:

> **Asunto:** Configuración de DNS - Plataforma de Conciliación Bancaria
>
> Estimado equipo de Bravium,
>
> Para habilitar el acceso a la plataforma desde su dominio **`braviumhub.com`**, necesitamos que configuren el siguiente registro en su proveedor de DNS:
>
> | Tipo | Nombre | Valor / Dirección |
> | :--- | :--- | :--- |
> | **A** | `@` (o el subdominio que elijan) | `[INGRESAR_IP_DE_TU_SERVIDOR]` |
>
> Una vez propagado el DNS, la plataforma responderá directamente bajo su dominio de forma segura.
>
> ---
>
> ### 🔑 Credenciales de Acceso (Administrador)
> | Nombre | Email |
> | :--- | :--- |
> | **Giovane Zago** | `giovane.zago@bravium.io` |
> | **Tamara Leyton** | `tamara.leyton@bravium.io` |
> | **Daniela Avila** | `daniela.avila@bravium.io` |
> | **Carlos Moran** | `cmoranr94@gmail.com` |
> _(puedes adjuntarle su pass temporal)_

Para desplegar la plataforma en **`dpsistemas.cl/contabilidad`**, se deben realizar tres configuraciones clave en el servidor.

---

## 1. Configuración del Frontend (Next.js)

Se debe informar a Next.js que la ruta base del sitio ya no es `/`, sino `/contabilidad`. 

**Archivo:** `apps/web/next.config.ts` (o `.js`)
```typescript
const nextConfig = {
  basePath: '/contabilidad', // <-- Agrega esta línea
  // ... resto de tu config
};
export default nextConfig;
```
*   **Efecto:** Todas las URLs internas, archivos estáticos (`/logo.svg`), y peticiones de carga se actualizarán automáticamente para incluir `/contabilidad` al inicio.

---

## 2. Configuración del Servidor (Nginx)

Como estarás usando un subdirectorio, el servidor web (Nginx) debe actuar como un **Reverse Proxy** para canalizar las peticiones del dominio a los puertos locales de tu backend y frontend en el servidor.

**Configuración Nginx Sugerida:**
```nginx
server {
    listen 80;
    server_name dpsistemas.cl;

    # --- FRONTEND (Next.js corriendo en puerto 3001) ---
    location /contabilidad/ {
        proxy_pass http://localhost:3001; # Dirección del proceso de Next.js
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # --- BACKEND API (NestJS corriendo en puerto 3000) ---
    location /contabilidad-api/ {
        proxy_pass http://localhost:3000/; # <-- Nota el slash final para quitar /contabilidad-api/ de la ruta
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 3. Instrucciones para enviar a **Bravium**

Para que el equipo de Bravium pueda integrarse y usar la plataforma, debes enviarle el siguiente correo o documento instructivo resumido:

> **Asunto:** Credenciales y Datos de Conexión @ Bravium Gestión Contable
>
> Estimado equipo de Bravium,
>
> Les compartimos las direcciones y accesos para interactuar con el módulo de conciliación bancaria y revisión de DTEs de nuestra plataforma:
>
> ### 🌐 1. Panel Operativo (Acceso Web)
> - **URL:** [https://dpsistemas.cl/contabilidad](https://dpsistemas.cl/contabilidad)
>
> ### 🔑 2. Credenciales de Acceso (Temporal)
> | Nombre | Email | Contraseña |
> | :--- | :--- | :--- |
> | **Giovane Zago** | `giovane.zago@bravium.io` | _[Ingresar_Contraseña]_ |
> | **Tamara Leyton** | `tamara.leyton@bravium.io` | _[Ingresar_Contraseña]_ |
> | **Daniela Avila** | `daniela.avila@bravium.io` | _[Ingresar_Contraseña]_ |
> | **Carlos Moran** | `cmoranr94@gmail.com` | _[Ingresar_Contraseña]_ |
> _(Se recomienda cambiar la contraseña desde el panel 'Mi Perfil' una vez ingresado)_
>
> ### ⚙️ 3. Endpoint de Integración API (Opcional si empujan datos externos)
> - **API Base:** `https://dpsistemas.cl/contabilidad-api`
