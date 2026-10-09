Probé 61 casos con "hoy" fijo en viernes 9 de octubre de 2026: 45 salen bien y 16 fallan. Lo importante es si un fallo puede terminar en una cita equivocada o solo en un rechazo.

🔴 Peligrosos: dan una fecha equivocada sin avisar
La IA manda	Resultado	Debería ser	Por qué
jueves 5 de noviembre	2027-10-05	2026-11-05	No lee el mes: usa el mes actual y, como el 5 de octubre ya pasó, salta al año siguiente.
lunes 2 de noviembre	2027-10-02	2026-11-02	Mismo problema.
hoy en la mañana	sáb 10	vie 9	Lee "mañana" como el día siguiente, aunque aquí es la parte del día.
el lunes en la mañana	sáb 10	lun 12	Mismo problema: "mañana" gana sobre "lunes".
Con estos casos la IA consulta cupos de otro día y, si el paciente acepta, la cita podría crearse en esa fecha equivocada.

🟡 Ambiguos, pero el sistema los frena
La IA manda	Resultado	Qué pasa
4:30 / 1:00 (sin AM/PM)	04:30 / 01:00	Se leen como de madrugada. No hay cupos a esa hora, así que se rechaza.
a las 4 / 8	04:00 / 08:00	Igual. Ojo: 8:00 AM sí puede existir el sábado, así que podría tomar 8 AM cuando era 8 PM (aunque no habría cupo de noche).
2026-02-30, 10/15/2026	fecha inválida	La búsqueda de cupos la rechaza ("Fecha invalida").
🟢 No los entiende, pero sin riesgo
15 de octubre, el 15, octubre 15, en dos semanas, mediodía: devuelven "fecha no válida" y la IA vuelve a preguntar o lo reintenta de otra forma.

Todo lo demás funciona: fechas exactas, hoy, mañana, pasado mañana, los días de la semana, "lunes 12", "martes 13 de octubre", "la próxima semana" y las horas con AM/PM o "de la tarde".

Qué propongo
Arreglar solo los 4 peligrosos, que es poco código en dateTimeResolver.service.js:

Que lea el mes cuando viene escrito ("de noviembre").
Que "en/por la mañana" no cuente como el día siguiente.
Los amarillos y los verdes los dejaría así: en el peor caso la IA vuelve a preguntar, nunca agenda mal.

También puedo dejar esta prueba fija en backend/scripts/, junto a la de recordatorios, para correrla cada vez que alguien toque ese archivo.

¿Arreglo los 4 peligrosos y dejo la prueba?

No revisé cuántas veces la IA realmente manda texto en lugar de una fecha exacta, porque eso no queda registrado. La descripción de la herramienta la invita a hacerlo ("o expresiones como 'hoy', 'mañana'"), así que pasa.

Terminé la prueba más completa y arreglé los fallos que podían dar una fecha equivocada. Quedan 5 fallos de 131,775 casos, y ninguno puede agendar mal.

Qué cubre la prueba:

Cada día entre 2026 y 2028 como "hoy", incluido el año bisiesto. Para cada uno: hoy, mañana, pasado mañana y los 7 días de la semana, escritos de unas 10 formas distintas ("el lunes", "para el lunes", "el lunes en la mañana", "la mañana del lunes", en mayúsculas, sin tilde…).
Cada día de cada mes, escrito como "5 de noviembre", "noviembre 5", con año, en formato numérico, y combinado con cada uno de los 7 días de la semana. Lo probé desde varios "hoy" (1 de enero, octubre, 31 de diciembre, febrero de un año bisiesto y de uno normal).
Cada hora de 1 a 12 con minutos 00, 15, 30 y 45, en cada formato ("PM", "p.m.", "p. m.", "de la tarde", "a las…", sin indicar AM/PM), contra 4 horarios: lunes a viernes, sábado, domingo cerrado y uno donde AM y PM caen ambos dentro del horario.
Cada resultado se compara con un cálculo independiente, no con el mismo código que se prueba.

Qué encontró y arreglé en dateTimeResolver.service.js:

Caso	Antes	Ahora
"esta mañana", "hoy de mañana"	día siguiente ❌	hoy ✅
"jueves 5" sin mes, cuando el 5 ya pasó	2027-10-05 ❌	5 de noviembre ✅
"lunes 13 de octubre" (el 13 es martes)	13 de octubre sin avisar	no válido → la IA pregunta ✅
"jueves 1 de enero" en oct 2026 (en 2027 cae viernes)	—	no válido → la IA pregunta ✅
"2:30 p. m." (con espacio, como escribe DeepSeek)	no válido	2:30 PM ✅
"las 3" (sin la "a")	no válido	3:00 PM ✅
Regla nueva: si el día de la semana no coincide con la fecha, el código no elige ninguno de los dos y la IA le pregunta al paciente.

Los 5 fallos que dejé son textos que no entiende: "14:30 hrs", "14:30 horas", "mediodía", "al mediodía" y "2 y media de la tarde". Tampoco entiende "el 15", "en dos semanas", "primero de noviembre", "5 de sept" ni "este fin de semana". En todos estos casos devuelve "no válido" y la IA vuelve a preguntar, así que no hay riesgo de cita equivocada. Puedo agregar cualquiera si lo ves seguido en los chats.

La prueba permanente mensajes-fechas-check.js ya incluye los casos nuevos y pasa (37 fechas y 20 horas). La prueba grande quedó solo en mi carpeta temporal, fuera del proyecto. No probé nada de esto con la IA real en el simulador.


NOTA: SEGUIR PROBANDO EN VIVO LUEGO DARE MI VEREDICTO