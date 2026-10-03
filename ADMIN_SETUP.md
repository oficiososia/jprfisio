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
