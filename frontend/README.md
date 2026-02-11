# 🎨 Frontend BRAVIUM - Dashboard de Conciliación

## 🚀 Inicio Rápido

### 1. Instalar Dependencias
```bash
cd frontend
npm install
```

### 2. Configurar Variables de Entorno

El archivo `.env.local` ya está configurado con:
```
NEXT_PUBLIC_API_URL=https://bravium-backend.onrender.com
```

Para desarrollo local, cambia a:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. Ejecutar en Desarrollo
```bash
npm run dev
```

El frontend estará disponible en: http://localhost:3001 (o el puerto que Next.js asigne)

---

## 📊 Dashboard de Conciliación

### Ruta
```
/conciliacion
```

### Características

#### 📈 Estadísticas en Tiempo Real
- **Transacciones Bancarias**: Total, matched, pending, tasa de match
- **DTEs**: Total, pagados, pendientes, tasa de pago
- **Matches**: Total, automáticos, manuales, tasa automática
- **Monto Pendiente**: Total por pagar

#### 📋 Tablas Interactivas
- **Transacciones Pendientes**: Top 20 por monto
- **DTEs Pendientes**: Top 20 por monto pendiente
- **Matches Recientes**: Últimos 10 matches creados
- **Top Proveedores**: Top 10 por deuda pendiente

#### 🔄 Acciones
- **Actualizar**: Refresca los datos del dashboard
- **Ejecutar Auto-Match**: Ejecuta el motor de matching automático

---

## 🎨 Componentes Visuales

### Cards de Estadísticas
- **Azul**: Transacciones bancarias
- **Púrpura**: DTEs (facturas)
- **Verde**: Matches
- **Ámbar**: Monto pendiente

### Tablas
- Hover effects para mejor UX
- Colores semánticos (rojo para cargos, verde para abonos)
- Badges para tipos de documentos
- Formato de moneda chileno (CLP)

---

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | URL del backend | `https://bravium-backend.onrender.com` |

### Período de Datos

Por defecto, el dashboard muestra datos de **Enero 2026**:
- Desde: `2026-01-01`
- Hasta: `2026-01-31`

Para cambiar el período, modifica el estado `dateRange` en `page.tsx`.

---

## 🧪 Desarrollo

### Estructura de Archivos
```
frontend/
├── app/
│   └── (operations)/
│       └── conciliacion/
│           └── page.tsx          # Dashboard principal
├── components/                    # Componentes reutilizables
├── globals.css                    # Estilos globales
└── .env.local                     # Variables de entorno
```

### Agregar Nuevas Funcionalidades

#### 1. Filtro de Fechas
Agrega inputs para cambiar el rango de fechas:

```tsx
<input 
  type="date" 
  value={dateRange.from}
  onChange={(e) => setDateRange({...dateRange, from: e.target.value})}
/>
```

#### 2. Confirmar Matches
Agrega botones para confirmar matches individuales:

```tsx
const confirmMatch = async (matchId: string) => {
  await fetch(`${API_URL}/conciliacion/matches/${matchId}/confirm`, {
    method: 'POST'
  });
  fetchDashboard();
};
```

#### 3. Exportar a Excel
Agrega funcionalidad de exportación:

```tsx
const exportToExcel = () => {
  // Implementar exportación
};
```

---

## 🎯 Próximas Mejoras

### Corto Plazo
- [ ] Filtro de fechas interactivo
- [ ] Paginación en tablas
- [ ] Búsqueda de transacciones/DTEs
- [ ] Confirmación de matches individuales

### Mediano Plazo
- [ ] Gráficos (Chart.js o Recharts)
- [ ] Exportar a Excel/PDF
- [ ] Notificaciones en tiempo real (WebSockets)
- [ ] Matching manual (drag & drop)

### Largo Plazo
- [ ] Dashboard personalizable
- [ ] Reportes automáticos
- [ ] Integración con más bancos
- [ ] Machine Learning para matching

---

## 🐛 Troubleshooting

### Error: "Failed to fetch"
- Verifica que el backend esté corriendo
- Verifica la URL en `.env.local`
- Revisa CORS en el backend

### Dashboard vacío
- Verifica que haya datos en el backend
- Ejecuta la sincronización de DTEs
- Revisa la consola del navegador para errores

### Estilos no se aplican
- Verifica que Tailwind CSS esté configurado
- Ejecuta `npm run dev` de nuevo
- Limpia el cache: `rm -rf .next`

---

## 📚 Recursos

- **Next.js**: https://nextjs.org/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Heroicons**: https://heroicons.com/
- **API Backend**: Ver `DASHBOARD_CONCILIACION.md` en la raíz

---

**Última Actualización**: 2026-02-11  
**Versión**: 1.0
