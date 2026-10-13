# Visor SSR Nacional

Visor territorial de los Sistemas Sanitarios Rurales oficiales de Chile.


## Datos vigentes

- Base oficial: BD_SSR_OFICIAL_2026_6.xlsx, actualización junio de 2026.
- 2.500 SSR, 808.107 arranques y 2.505.276 beneficiarios estimados.
- 2.252 áreas de servicio de las 16 regiones, incorporadas el 13 de octubre de 2026.
- 248 SSR no cuentan con polígono en la capa recibida. Se conservan como puntos.

Las áreas se distribuyen en GeoJSON regionales en `public/data/areas-servicio/`.
El vínculo con la base utiliza `ID_SSR` (áreas) y `MXLOCATION` (Excel).
Se conservan todos los vértices y anillos, distinguiendo exteriores y huecos.
El JSON de ArcGIS recibido etiqueta la referencia como 5360, pero sus valores
ya están expresados en longitud/latitud. Se conservan esas coordenadas angulares
sin aplicarles una transformación UTM. Las posiciones de los puntos provienen
de las columnas geográficas SIRGAS Chile del Excel. La validación de rangos
para visualización no constituye una verificación topográfica en terreno.

Para regenerar los datos, con Python y openpyxl instalados:

```sh
python scripts/update_data.py /ruta/base.xlsx /ruta/areas.json
npm ci
npm run build
```

La importación publica únicamente los campos utilizados por el visor. El Excel
original y sus datos de contactos no se incorporan al repositorio.

