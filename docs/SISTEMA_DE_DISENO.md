# Sistema de diseño de Nuestro Hogar (v33)

Una sola forma de decidir tamaños, espacios, colores, movimiento y piezas de interfaz. Todo lo nuevo se construye con esto; lo existente se migra poco a poco.

## 1. Personalidad

**Elegante, tranquila y clara.** El dinero de una familia es un tema serio: la app no grita.
- Una sola voz llamativa: los **títulos y las cifras grandes** usan una serif (Lora). Todo lo demás usa Inter.
- El color de acción (verde bosque por defecto) se reserva para lo que se puede tocar y para lo positivo. El rojo solo aparece cuando algo se pasó del límite o está en negativo; un gasto normal no es rojo.
- Etiquetas en minúscula normal ("Tu dinero, con claridad"), nunca en MAYÚSCULAS espaciadas.
- Ilustraciones propias con motivos de Guatemala: el Volcán de Agua para las metas, la casa de teja para el hogar, el quetzal en las monedas y el barrilete para los ingresos extra.

## 2. Dónde vive cada cosa

```
src/styles.css                 índice: tokens + base
src/styles/00-tokens.css       escalas (--ds-*) y fuentes
src/styles/theme.css           colores de ambos temas (--nh-*), únicos colores permitidos
src/styles/01..05-*.css        base histórica (fundación, finanzas, módulos, estructura, capas)
src/styles/layers/*.css        capas de rediseños anteriores (premium, studio, experience…)
src/styles/components/*.css    piezas compartidas (ui, búsqueda rápida, notificaciones, master)
src/styles/modules/*.css       hojas de cada módulo (se cargan con su módulo)
src/styles/refinements.css     últimos ajustes; se carga al final
src/ui/                        componentes del sistema
public/fonts/                  Inter y Lora (subconjunto, licencia OFL)
```

Orden de carga: tokens → base → tema → capas → componentes → refinamientos. Los módulos se cargan al abrirse.

## 3. Tokens

| Grupo | Tokens | Uso |
| --- | --- | --- |
| Tipo | `--ds-fs-xs` 12 · `sm` 13 · `md` 15 · `lg` 17 · `xl` 20 · `2xl` 24 · `3xl` 30 · `display` 36–52 | Nada menor a 12 px. |
| Familias | `--ds-font-ui` (Inter), `--ds-font-display` (Lora) | Lora solo en títulos de página, saludo y cifra principal. |
| Peso | 400 · 500 · 600 · 700 | Sin 650/680/850. |
| Espacio | `--ds-space-1…12` (4 · 8 · 12 · 16 · 20 · 24 · 32 · 48) | Cuadrícula de 4 px. |
| Radio | `--ds-radius-sm` 8 · `md` 12 · `lg` 16 · `xl` 22 · `pill` | Más pequeño adentro, más grande afuera. |
| Elevación | `--ds-elev-1…3` | Tres niveles. |
| Capas | `--ds-z-*` (sticky 10 · header 12 · fab 14 · nav 15 · scrim 90 · dialog 100 · toast 110) | |
| Movimiento | `--ds-ease-out`, `--ds-dur-fast` 120 ms · `base` 200 · `slow` 320 · `count` 700 | Se apagan con "reducir movimiento". |
| Toque | `--ds-tap` 44 px | Botones de ícono y acciones. |
| Color | `--nh-*` en `theme.css` (incluye `--nh-ill-*` para ilustraciones) | Contraste AA verificado por pruebas en ambos temas y cuatro acentos. |

Avance de la migración: 1,223 tamaños de letra y 690 radios ya usan tokens. Quedan 9 tamaños y 12 radios sin escala (cifras grandes especiales y barras finas), frente a 31 y 31 en v31.

## 4. Componentes (`src/ui`)

| Componente | Para qué |
| --- | --- |
| `Amount` | Montos con cifras alineadas, signo correcto, sin cortar "Q" del número y ocultos con "Ocultar montos". `animate` cuenta desde el valor anterior: se usa solo en la cifra principal de Inicio. |
| `EmptyState` | Pantallas vacías: ilustración, qué va aquí y la acción que lo llena. |
| `Illustration` | 12 ilustraciones: movements, budget, goal, accounts, calendar, done, home, savings, solo, couple, family, kite. Toman los colores del tema. |
| `Button` / `IconButton` | Primario (uno por vista), secundario, discreto y peligro. El de ícono exige `label` y mide 44 px. |
| `ProgressBar` | Avance con estado "excedido" en rojo. |

## 5. Movimiento

Pocos momentos, todos con propósito:
1. La cifra principal de Inicio cuenta hasta su valor al abrir.
2. Ventanas y hojas: el fondo se oscurece y el panel sube (teléfono) o se asienta (escritorio).
3. Barras de progreso crecen una vez; botones responden al toque.

Todo se desactiva con `prefers-reduced-motion`.

## 6. Reglas para código nuevo

- Solo `var(--nh-*)` para color y `var(--ds-*)` para tamaños, espacios, radios, sombras, capas y tiempos.
- Nada de `!important` nuevo; si hace falta, la regla está en el lugar equivocado.
- Botones de solo ícono con `aria-label`; campos con `<label>`; foco visible.
- Textos en español claro, en minúscula normal, con verbos concretos ("Guardar presupuesto", no "Enviar").
- Antes de entregar, revisar el cambio en teléfono y escritorio, día y noche.

## 7. Siguiente limpieza

- Unir las capas históricas (`layers/premium`, `studio`, `experience`, `refinement`) en las reglas originales, una pantalla a la vez, con comparación de capturas antes y después.
- Bajar los 57 `!important` restantes.
- Migrar los botones y montos existentes a `Button` y `Amount`.
