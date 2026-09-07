# Comparación pública: informe IOCG 2013 y balance de masa

Visor estático para contrastar el *Report Book 2013/00014* (Fabris, Halley, van der Wielen, Keeping y Gordon) con la mineralogía cuantitativa de `Resultado_Balance_Mineral.csv`.

Las dos fuentes describen los **mismos 1 225 intervalos** de 43 sondajes del este del Cratón Gawler (provincia Olímpica Cu-Au). El informe clasifica alteración con geoquímica, HyLogger y petrofísica. El CSV de mineralogía cuantitativa se obtuvo en el módulo [GeoIA / balance](https://geoia.site/balance/).

## Cómo verlo

Sitio público (GitHub Pages):

**https://jhon21geo.github.io/balance_de_masa/**

Informe original (PDF, 21 MB): **https://jhon21geo.github.io/balance_de_masa/RB201300014.pdf**

El PDF se descargó del [catálogo SARIG](https://catalog.sarig.sa.gov.au/document/d20010635) (registro `d20010635`, Geological Survey of South Australia / Department for Energy and Mining). Copia oficial: [RB201300014.pdf en mesac-public](https://demstedpprodaue12.blob.core.windows.net/mesac-public/resources/files/4347046/RB201300014.pdf). PID: <https://pid.sarig.sa.gov.au/document/d20010635>. Licencia del catálogo: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

El archivo `Resultado_Balance_Mineral.csv` se obtuvo en el módulo **[https://geoia.site/balance/](https://geoia.site/balance/)** (GeoIA: balance mineral BVLS y zonación de alteración).

Para trabajar en local (los `fetch` de JSON no funcionan como `file://`):

```bash
python3 -m http.server 8080 --directory docs
```

Luego abre `http://localhost:8080`.

## Qué muestra el visor

- Similitudes: depleción de Na, dominio de mica blanca y clorita Fe-rica, ventanas w2200/w2250 hacia cobre, Fe metasomático.
- Diferencias: K-feldespato y cuarzo que el SWIR no ve, magnetita modelada vs MagSus, nomenclatura tipo pórfido vs ensamblajes IOCG, 38 % de acuerdo entre familia TSA y familia de masa.
- Mapa de sondajes, recreación de los diagramas GER / Fe-Al / Cu-w2200 del informe, matriz de confusión y un explorador por pozo.

## Datos

| Archivo | Rol |
| --- | --- |
| `docs/RB201300014.pdf` | Informe Fabris et al. 2013, copiado desde SARIG `d20010635` |
| `Resultado_Balance_Mineral.csv` | Geoquímica + TSA + modos de balance; obtenido en [geoia.site/balance](https://geoia.site/balance/) |
| `scripts/prepare_data.py` | Reconstruye clases GER/TSA y escribe `docs/data/*.json` |
| `docs/` | Sitio público (GitHub Pages) |

Cita del informe:

> Fabris AJ, Halley S, van der Wielen S, Keeping T, Gordon G 2013. *IOCG-style mineralisation in the central eastern Gawler Craton, SA; characterisation of alteration, geochemical associations and exploration vectors*, Report Book 2013/00014.

## Licencia

MIT (código del visor). El Report Book 2013/00014 es una publicación del Government of South Australia; en el catálogo SARIG figura con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Aquí se redistribuye con atribución.
