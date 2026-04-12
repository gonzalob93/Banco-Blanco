# 🏦 Banco Blanco — Simulador de Banca Privada

Aplicación web de banca privada desarrollada con HTML, CSS y JavaScript vanilla. No requiere backend ni dependencias externas: todo corre en el navegador.

## ✨ Funcionalidades

### Para usuarios
| Módulo | Detalle |
|---|---|
| **Registro e inicio de sesión** | Creación de cuenta con usuario y contraseña |
| **Cuenta en pesos (ARS)** | Saldo, depósitos y transferencias entre usuarios |
| **Cuenta en dólares (USD)** | Apertura opcional, compra/venta/transferencia de divisas |
| **Préstamos** | Amortización por sistema francés, hasta 72 meses, con simulación en tiempo real |
| **Plazos fijos** | Hasta 12 meses, con cálculo de interés y simulación antes de confirmar |
| **Historial** | Movimientos ARS y USD separados, con fecha y descripción |

### Para el administrador
| Módulo | Detalle |
|---|---|
| **Gestión de usuarios** | Ver, ajustar saldos ARS y USD, eliminar cuentas |
| **Préstamos y Plazos** | Vista global de todos los productos activos y moras |
| **Divisas** | Posición en USD de cada usuario con equivalente en ARS |
| **Transacciones** | Historial completo de todas las operaciones del sistema |
| **Tasas y TC** | Configuración de TNA para PF y préstamos, mora, y tipo de cambio comprador/vendedor |

## 🔐 Accesos de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Usuario | `juan` | `1234` |
| Usuario | `maria` | `1234` |
| Admin | *(conocido por el administrador)* | *(confidencial)* |

## 💡 Lógica financiera

- **Sistema francés**: cuota fija calculada como `C × i × (1+i)^n / ((1+i)^n − 1)` donde `i` es la tasa mensual y `n` el número de cuotas.
- **Plazo fijo**: interés simple → `capital × TNA × (meses / 12)`.
- **Mora**: si al vencimiento de una cuota el usuario no tiene saldo, se aplica la tasa de mora mensual sobre el saldo de capital pendiente.
- **Vencimientos**: se procesan automáticamente al iniciar sesión.
- **Tipo de cambio**: spread entre TC comprador (banco compra USD) y TC vendedor (banco vende USD).

## 🚀 Cómo ejecutar

### Opción 1 — Abrir directamente
Abrí `index.html` en cualquier navegador moderno. No necesita servidor.

### Opción 2 — Servidor local (recomendado)
```bash
# Con Python
python3 -m http.server 8080

# Con Node.js (npx)
npx serve .

# Con VS Code
# Instalá la extensión "Live Server" y hacé click en "Go Live"
```
Luego abrí `http://localhost:8080` en tu navegador.

### Opción 3 — GitHub Pages
1. Subí el repositorio a GitHub.
2. Andá a **Settings → Pages**.
3. En *Source*, seleccioná la rama `main` y la carpeta `/ (root)`.
4. Guardá. En unos minutos la app estará disponible en `https://<tu-usuario>.github.io/<nombre-repo>/`.

## 📁 Estructura del proyecto

```
banco-blanco/
├── index.html      # Estructura HTML completa (pantallas, modales)
├── app.js          # Toda la lógica: estado, renders, operaciones
├── .gitignore      # Archivos excluidos del repositorio
└── README.md       # Este archivo
```

## ⚙️ Configuración inicial

Los parámetros por defecto están definidos al inicio de `app.js`:

```js
let config = {
  tasaPF:    10,    // TNA Plazo Fijo (%)
  tasaPR:    15,    // TNA Préstamos (%)
  tasaMora:   5,    // Mora mensual (%)
  tcCompra: 1370,   // TC Comprador ARS/USD
  tcVenta:  1400,   // TC Vendedor ARS/USD
};
```

Estos valores también son editables desde el panel de administración en tiempo real.

## 📝 Notas importantes

- **Los datos son volátiles**: al recargar la página se pierden los cambios, ya que todo vive en memoria. Para persistencia real se necesita un backend o localStorage.
- **Es una simulación**: no realiza operaciones financieras reales.
- **Compatible con**: Chrome, Firefox, Safari, Edge (versiones modernas).

## 🛠️ Tecnologías

- HTML5 semántico
- CSS3 con variables personalizadas (`custom properties`)
- JavaScript ES6+ (sin frameworks ni dependencias)

---

*Desarrollado con Claude (Anthropic) · Paleta de colores inspirada en HSBC*
