# Datos

Este directorio contiene archivos de datos para importación y testing.

## `dte_recibidos_77154188.csv`

Archivo CSV con DTEs (Documentos Tributarios Electrónicos) recibidos desde LibreDTE.

### Uso
Este archivo es utilizado por el script `scripts/upload_dtes_prod.js` para cargar manualmente DTEs al sistema de producción.

### Formato
El archivo contiene los datos de facturas recibidas en formato CSV exportado desde LibreDTE.

### Nota
Este directorio está incluido en `.gitignore` para evitar subir datos sensibles al repositorio.
