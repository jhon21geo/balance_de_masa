# Comparación pública: informe IOCG 2013 y balance de masa

Visor estático para contrastar el *Report Book 2013/00014* (Fabris, Halley, van der Wielen, Keeping y Gordon) con la mineralogía cuantitativa de `Resultado_Balance_Mineral.csv`.

Las dos fuentes describen los **mismos 1 225 intervalos** de 43 sondajes del este del Cratón Gawler (provincia Olímpica Cu-Au). El informe clasifica alteración con geoquímica, HyLogger y petrofísica. El CSV ajusta 34 minerales por balance de masa sobre esa química.

## Cómo verlo

Abre `docs/index.html` con un servidor local (los `fetch` de JSON no funcionan como `file://`):

```bash
python3 -m http.server 8080 --directory docs
```

Luego visita `http://localhost:8080`. En GitHub Pages, publica la carpeta `docs/` de la rama principal.

## Qué muestra el visor

- Similitudes: depleción de Na, dominio de mica blanca y clorita Fe-rica, ventanas w2200/w2250 hacia cobre, Fe metasomático.
- Diferencias: K-feldespato y cuarzo que el SWIR no ve, magnetita modelada vs MagSus, nomenclatura tipo pórfido vs ensamblajes IOCG, 38 % de acuerdo entre familia TSA y familia de masa.
- Mapa de sondajes, recreación de los diagramas GER / Fe-Al / Cu-w2200 del informe, matriz de confusión y un explorador por pozo.

## Datos

| Archivo | Rol |
| --- | --- |
| `RB201300014.pdf` | Informe original (GSSA / DMITRE, 2013) |
| `Resultado_Balance_Mineral.csv` | Geoquímica + TSA + modos de balance |
| `scripts/prepare_data.py` | Reconstruye clases GER/TSA y escribe `docs/data/*.json` |
| `docs/` | Sitio público |

Cita del informe:

> Fabris AJ, Halley S, van der Wielen S, Keeping T, Gordon G 2013. *IOCG-style mineralisation in the central eastern Gawler Craton, SA; characterisation of alteration, geochemical associations and exploration vectors*, Report Book 2013/00014.

## Licencia

MIT (código del visor). El report book sigue siendo © Government of South Australia 2013; aquí solo se usan figuras para comparación y se cita la fuente.
