# Configuración del administrador

En Vercel → proyecto jprfisio → Settings → Environment Variables, añade en Production:

- ADMIN_USERNAME: jpr (también es el usuario predeterminado).
- ADMIN_PASSWORD: la contraseña elegida por el propietario, guardada únicamente aquí.
- ADMIN_SESSION_SECRET: secreto aleatorio de al menos 32 caracteres, distinto de la contraseña.
- VERCEL_API_TOKEN: token de acceso de Vercel con acceso al proyecto.
- VERCEL_ANALYTICS_PROJECT_ID: ID prj_… en Settings → General del proyecto.
- VERCEL_ANALYTICS_TEAM_ID: ID team_… si pertenece a un equipo.

Después realiza un Redeploy. No pongas estos valores en GitHub ni en variables públicas. No hay contraseña predeterminada. El login permanece cerrado hasta configurar las credenciales.

El panel consulta Web Analytics mediante su API oficial. Los informes de rendimiento, observabilidad y consumo tienen enlaces al panel completo de Vercel y requieren iniciar sesión en Vercel. No se muestra información inventada cuando faltan datos o permisos.

La sesión dura 8 horas, usa una cookie Secure/HttpOnly/SameSite=Strict y firma HMAC. La limitación de intentos es por instancia; para protección frente a ataques distribuidos, configura una regla de rate limiting del Firewall de Vercel en /api/admin?action=login.

Documentación: https://vercel.com/docs/analytics/web-analytics-api

## Fotos y carrusel de entrenamiento

En **Fotos y vídeo** se editan la portada, Sobre mí, Metodología y el carrusel de Entrenamiento. El carrusel tiene cinco posiciones de foto y una de vídeo; las posiciones vacías se omiten. Cada foto permanece cuatro segundos. Del vídeo MP4/WebM se reproducen los primeros dos segundos, sin sonido. El vídeo debe durar al menos dos segundos y pesar como máximo 3 MB; las fotos se optimizan a WebP (hasta 2 MB).

Las fotos existentes se conservan. Hasta cargar el resto del material, Entrenamiento sigue mostrando su foto publicada. La rotación se pausa al salir de la sección, ocultar la pestaña o usar los controles; se reanuda con el botón de reproducción. Respeta la preferencia de movimiento reducido.

Las imágenes de la web no tienen una URL antigua provisional: se asignan al recibir `site-content.json`, solicitado sin caché. Si esa petición falla, se ofrece un botón de reintento.

## Verificación

- `npm test`: validación del contenido, archivos, autenticación y publicación con GitHub simulado.
- `tests/browser.html`: pruebas de navegador sobre el HTML y JavaScript reales, con contenido de ejemplo dentro de iframes. Servir el repositorio como raíz estática y crear antes este vídeo temporal de cuatro segundos (requiere FFmpeg):

```sh
ffmpeg -f lavfi -i testsrc2=size=320x240:rate=30 -t 4 -c:v libx264 -pix_fmt yuv420p -movflags +faststart media/11111111111111111111111111111111.mp4
```

Abrir `/tests/browser.html`. El clip de prueba permite comprobar que la web reproduce solo dos segundos; no debe publicarse ni añadirse a Git.
