# 🏦 Banco Blanco — Simulador de Banca Privada

Aplicación web de banca privada desarrollada con HTML, CSS y JavaScript vanilla. Los datos se persisten en la nube mediante **Firebase Firestore** y se sincronizan en tiempo real entre sesiones.

## ✨ Funcionalidades

### Para usuarios
| Módulo | Detalle |
|---|---|
| **Registro e inicio de sesión** | Creación de cuenta con usuario y contraseña |
| **Cuenta corriente (ARS)** | Saldo, depósitos, transferencias entre usuarios y giro en descubierto |
| **Caja de ahorro (ARS)** | Apertura opcional, depósitos, transferencias y acreditación mensual de intereses |
| **Movimiento entre cuentas** | Transferencia de fondos entre cuenta corriente y caja de ahorro propias |
| **Cuenta en dólares (USD)** | Apertura opcional, compra/venta/transferencia de divisas |
| **Préstamos** | Amortización por sistema francés, hasta 72 meses, con simulación en tiempo real |
| **Plazos fijos** | Hasta 12 meses, con cálculo de interés y simulación antes de confirmar |
| **Historial** | Movimientos ARS (CC y CA) y USD separados, con fecha y descripción |

### Para el administrador
| Módulo | Detalle |
|---|---|
| **Gestión de usuarios** | Ver, ajustar saldos ARS (CC y CA) y USD, setear límite de descubierto, eliminar cuentas |
| **Préstamos y Plazos** | Vista global de todos los productos activos y moras |
| **Divisas** | Posición en USD de cada usuario con equivalente en ARS |
| **Transacciones** | Historial completo de todas las operaciones del sistema |
| **Tasas y TC** | Configuración de TNA para PF, préstamos, descubierto y caja de ahorro; mora; tipo de cambio comprador/vendedor; topes de depósito y saldo máximo |

## 💡 Lógica financiera

- **Sistema francés**: cuota fija calculada como `C × i × (1+i)^n / ((1+i)^n − 1)` donde `i` es la tasa mensual y `n` el número de cuotas.
- **Plazo fijo**: interés simple → `capital × TNA × (meses / 12)`.
- **Caja de ahorro**: acumula interés diario (`saldo × TNA / 365`) y lo acredita el día 1 de cada mes.
- **Descubierto**: permite operar con saldo negativo hasta el límite configurado por el admin (default: $50.000). Al depositar, se cobran los intereses acumulados sobre el saldo negativo.
- **Mora**: si al vencimiento de una cuota el usuario no tiene saldo suficiente, se aplica la tasa de mora mensual sobre el capital pendiente.
- **Vencimientos**: se procesan automáticamente al iniciar sesión (plazos fijos, cuotas de préstamos, intereses de CA e intereses por descubierto).
- **Tipo de cambio**: spread entre TC comprador (banco compra USD) y TC vendedor (banco vende USD).

## ⚙️ Configuración inicial

Los parámetros se guardan en Firestore (`config/global`) y son editables desde el panel de administración. Los valores por defecto al crear el documento son:

```js
{
  tasaPF:          10,       // TNA Plazo Fijo (%)
  tasaPR:          15,       // TNA Préstamos (%)
  tasaMora:         5,       // Mora mensual (%)
  tasaDescubierto: 50,       // TNA Giro en descubierto (%)
  tasaCA:           4,       // TNA Caja de ahorro (%)
  tcCompra:      1370,       // TC Comprador ARS/USD (banco compra USD)
  tcVenta:       1400,       // TC Vendedor ARS/USD (banco vende USD)
  topeDeposito: 1000000,     // Monto máximo por depósito (ARS)
  saldoMaxARS:  50000000,    // Saldo máximo por cuenta (ARS)
}
```

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
├── app.js          # Toda la lógica: estado, renders, operaciones financieras
├── .gitignore      # Archivos excluidos del repositorio
└── README.md       # Este archivo
```

## 📝 Notas importantes

- **Los datos persisten en la nube**: la app usa Firebase Firestore para almacenar y sincronizar datos en tiempo real. Los cambios se reflejan automáticamente en todas las sesiones abiertas.
- **Límite de Firestore**: las transacciones se almacenan dentro del documento del usuario. Firestore tiene un límite de 1 MB por documento, por lo que cuentas con un volumen muy alto de movimientos podrían eventualmente alcanzarlo.
- **Es una simulación**: no realiza operaciones financieras reales.
- **Compatible con**: Chrome, Firefox, Safari, Edge (versiones modernas).

## 🛠️ Tecnologías

- HTML5 semántico
- CSS3 con variables personalizadas (`custom properties`)
- JavaScript ES6+ (sin frameworks ni dependencias)
- Firebase Firestore (persistencia y sincronización en tiempo real)

---

*Desarrollado con Claude (Anthropic)*
