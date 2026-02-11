# Configuración de LibreDTE API

## Cómo obtener tu API Hash

1. Ve a tu perfil en LibreDTE: https://libredte.cl/usuarios/perfil
2. En la sección "Datos del usuario y acceso a la API"
3. Copia el **API hash** (son puntos suspensivos en la interfaz, haz clic en el ojo para verlo)

## Formato de Autenticación

LibreDTE usa **HTTP Basic Authentication** con el siguiente formato:

```
Authorization: Basic BASE64(X:APIHASH)
```

Donde:
- `X` es cualquier carácter (literalmente la letra "X")
- `APIHASH` es tu API hash del perfil

## Uso del Script de Prueba

### 1. Edita el archivo de prueba

Abre `scripts/test_libredte_connection.js` y reemplaza:

```javascript
const API_HASH = 'TU_API_HASH_AQUI'; // Pega aquí tu API hash real
const RUT = '77154188'; // Tu RUT sin DV
```

### 2. Ejecuta el script

```bash
node scripts/test_libredte_connection.js
```

## Endpoints Probados

El script prueba 3 endpoints básicos:

1. **GET /api/dte/contribuyentes/info/{rut}**
   - Obtiene información del contribuyente
   - Endpoint más simple para verificar autenticación

2. **POST /api/dte/dte_tmps/buscar/{rut}**
   - Lista documentos temporales
   - Requiere autenticación válida

3. **POST /api/dte/dte_recibidos/buscar/{rut}**
   - Busca DTEs recibidos por fecha
   - Endpoint que necesitas para tu integración

## Posibles Errores

### 401 Unauthorized
- API hash incorrecto
- Formato de autenticación incorrecto
- Verifica que copiaste el hash completo

### 402 Payment Required
- Tu plan no tiene acceso a ese endpoint específico
- Contacta a LibreDTE para verificar tu plan

### 406 Not Acceptable / Argumentos Insuficientes
- Parámetros faltantes o incorrectos en el request
- Verifica el formato del payload

### 404 Not Found
- Endpoint incorrecto
- RUT no existe o formato incorrecto

## Documentación Oficial

- API Docs: https://www.libredte.cl/docs/api
- Perfil de Usuario: https://libredte.cl/usuarios/perfil

## Notas Importantes

⚠️ **NUNCA** subas tu API hash al repositorio Git
⚠️ El API hash es como una contraseña, mantenlo seguro
⚠️ Si el hash se compromete, puedes regenerarlo desde tu perfil
