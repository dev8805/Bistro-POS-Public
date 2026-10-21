from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

doc = Document()

# Configurar márgenes
sections = doc.sections
for section in sections:
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

style = doc.styles['Normal']
font = style.font
font.name = 'Calibri'
font.size = Pt(11)

# --- PORTADA ---
for _ in range(4):
    doc.add_paragraph()

title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('PERSPECTIVAS ECONÓMICAS 2026')
run.bold = True
run.font.size = Pt(28)
run.font.color.rgb = RGBColor(0x1B, 0x3A, 0x5C)

subtitle = doc.add_paragraph()
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = subtitle.add_run('Hoja de Ruta para la Recuperación y el Crecimiento')
run.font.size = Pt(18)
run.font.color.rgb = RGBColor(0x4A, 0x4A, 0x4A)

doc.add_paragraph()
doc.add_paragraph()

info = doc.add_paragraph()
info.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = info.add_run('Gran Foro de Perspectivas Económicas\n')
run.font.size = Pt(12)
run = info.add_run('Cámara de Comercio de Medellín para Antioquia\n')
run.font.size = Pt(12)
run = info.add_run('Valor Público (Universidad EAFIT) · ANIF · Grupo El Colombiano')
run.font.size = Pt(12)

doc.add_paragraph()
source = doc.add_paragraph()
source.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = source.add_run('Fuente: https://www.youtube.com/watch/bOSw9U0uPNc')
run.font.size = Pt(10)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

# --- NUEVA PÁGINA ---
doc.add_page_break()

# --- TABLA DE CONTENIDOS ---
doc.add_heading('Tabla de Contenidos', level=1)
toc_items = [
    '1. Apertura y Bienvenida',
    '2. Informe de Coyuntura Nacional — César Tamayo Tobón',
    '3. Informe de Coyuntura Regional (Antioquia) — John Freddy Pulgarín Sierra',
    '4. Sostenibilidad Fiscal — José Ignacio López (ANIF)',
    '5. Panel: 100 Días para Poner la Casa en Orden',
    '6. Panel: Sistema de Salud',
    '7. Panel: Infraestructura y Vivienda',
    '8. Panel: Energía — Entre la Transición y la Autonomía',
    '9. Panel: Minería Responsable como Motor de Desarrollo',
    '10. Cierre: Liderazgo para la Democracia y la Competitividad',
    '11. Resumen Ejecutivo',
]
for item in toc_items:
    doc.add_paragraph(item, style='List Number')

doc.add_page_break()

# --- HELPER FUNCTIONS ---
def add_h1(text):
    doc.add_heading(text, level=1)

def add_h2(text):
    doc.add_heading(text, level=2)

def add_h3(text):
    doc.add_heading(text, level=3)

def add_para(text, bold=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    return p

def add_bullet(text):
    doc.add_paragraph(text, style='List Bullet')

def add_quote(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(1)
    run = p.add_run(f'"{text}"')
    run.italic = True

def add_table(headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = 'Light Shading Accent 1'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        for paragraph in hdr_cells[i].paragraphs:
            for run in paragraph.runs:
                run.bold = True
    for r_idx, row_data in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        for c_idx, cell_text in enumerate(row_data):
            row_cells[c_idx].text = cell_text
    doc.add_paragraph()

# ============================================================
# SECCIÓN 1
# ============================================================
add_h1('1. Apertura y Bienvenida')

add_h2('Contexto del foro')
add_para('Colombia llega a 2026 en uno de los momentos más determinantes de los últimos años:')
add_bullet('Desaceleración económica que ha impactado sectores clave: construcción, industria y comercio.')
add_bullet('Discusión fiscal que exige equilibrio entre sostenibilidad y gasto social.')
add_bullet('Entorno global marcado por tensiones comerciales, guerras, volatilidad energética y nuevas reglas económicas impulsadas por EE.UU. y China.')
add_bullet('El país se prepara para elegir un nuevo gobierno.')

add_para('Pregunta central del foro: ¿Qué decisiones necesita Colombia para recuperar confianza, dinamizar la inversión y volver a crecer de manera sostenible?', bold=True)

add_h2('Palabras de Piedad Hernández Obando')
add_para('Presidenta de Junta Directiva, Cámara de Comercio de Medellín para Antioquia')
add_bullet('Año anterior: más de 40,000 empresas formalizadas.')
add_bullet('En lo corrido de 2026: 9,000 nuevos emprendimientos matriculados.')
add_bullet('Antioquia: 15% del PIB nacional, participación similar en exportaciones.')
add_bullet('87% del empleo en Antioquia lo genera el sector privado.')
add_quote('Sin empresas no hay país, no hay desarrollo ni hay posibilidad alguna de construir una democracia.')

doc.add_page_break()

# ============================================================
# SECCIÓN 2
# ============================================================
add_h1('2. Informe de Coyuntura Nacional')
add_para('Ponente: César Tamayo Tobón — Decano de la Escuela de Finanzas, Economía y Gobierno de EAFIT, investigador del Centro de Valor Público.', bold=True)

add_h2('2.1 Panorama Económico Global')
add_h3('Proyecciones del FMI')
add_bullet('Relativa estabilidad global proyectada, pero con crecimiento a varias velocidades.')
add_bullet('Menor sincronía entre regiones: EE.UU. desacelerándose, zona euro acelerándose, América Latina con ligera aceleración, China desacelerándose.')
add_bullet('Las bandas de error en las proyecciones se están haciendo más grandes por incertidumbre creciente.')

add_h3('Estados Unidos')
add_bullet('Crecimiento ~2% en primer trimestre 2026.')
add_bullet('Desempleo subiendo desde niveles históricamente bajos (~3.5%).')
add_bullet('Inflación repuntando, superando tasa de política monetaria.')
add_bullet('Reserva Federal había frenado las bajas de tasa.')

add_h3('Choque petrolero — Guerra en Medio Oriente')
add_bullet('Estrecho de Ormuz de facto cerrado desde finales de febrero 2026.')
add_bullet('Brent ha superado los $110-115 por barril.')
add_bullet('El mundo ha capoteado con reservas + no ser época pico de consumo.')
add_bullet('Impacto fuerte proyectado para segundo y tercer trimestre (verano).')
add_bullet('Más afectados: India, China y Europa.')

add_h3('China')
add_bullet('Choque de oferta negativo por precio del petróleo.')
add_bullet('Dificultades para cumplir meta de crecimiento del 5%.')
add_bullet('Diversificando exportaciones ante aranceles de EE.UU.')
add_bullet('Reunión Trump-Xi Jinping: mensaje conciliador pero sin desmontar aranceles.')

add_h3('Mercados bursátiles')
add_bullet('Bolsa EE.UU.: mejor hoy que antes de la guerra.')
add_bullet('Bolsa China: flat (similar a antes de la guerra).')
add_bullet('Bolsa Europa: por debajo (gran perjudicada por dependencia petrolera).')

add_h2('2.2 Economía Colombiana')
add_h3('Crecimiento')
add_bullet('PIB primer trimestre 2026: 2.2% (similar al cuarto trimestre 2025).')
add_bullet('Jalonado por administración pública (gasto público 4x más que economía general). No es saludable.')
add_bullet('Manufactura creciendo a buena tasa (buena noticia).')
add_bullet('Agro decreciendo, construcción peor que cierre de 2025 (malas noticias).')

add_h3('Inversión')
add_bullet('Tasa de inversión como % del PIB: estancada en 16-17%.')
add_bullet('Se necesita más del 22-23% para crecer sin inflación.')
add_bullet('Inversión creció pero a tasa insuficiente.')

add_h3('Mercado laboral')
add_bullet('Desempleo tocó niveles históricamente bajos (8.3%).')
add_bullet('Empleo privado perdió ~500,000 puestos en lo corrido de 2026.')
add_bullet('Informalidad estancada alrededor del 55%.')

add_h3('Sector externo')
add_bullet('Cuenta corriente deteriorándose (más de 3 puntos del PIB de déficit).')
add_bullet('Inversión extranjera directa cayó en 2025.')

add_h2('2.3 Preocupaciones principales')
add_h3('Inflación')
add_bullet('Inflación total: 5.7% (meta Banco de la República: 3%).')
add_bullet('Inflación sin alimentos ni energéticos: 6.3% (más del doble de la meta).')
add_bullet('Inflación de servicios: 7.3% (disparada por salario mínimo).')
add_bullet('No es tendencia regional: resto de América Latina la inflación cede.')
add_bullet('Riesgo adicional: fenómeno del Niño fuerte/muy fuerte.')

add_h3('Situación fiscal')
add_bullet('Déficit primario 2025 mayor al esperado; 2026 proyectado peor.')
add_bullet('Tasas de endeudamiento a corto plazo superando el 13%.')
add_bullet('CDS muestran percepción de riesgo soberano mucho peor que en 2021.')

add_para('Mensaje final: Las condiciones externas no son desfavorables para Colombia. La oportunidad está en un nuevo gobierno que dé señales claras.', bold=True)

doc.add_page_break()

# ============================================================
# SECCIÓN 3
# ============================================================
add_h1('3. Informe de Coyuntura Regional (Antioquia)')
add_para('Ponente: John Freddy Pulgarín Sierra — Vicepresidente de Competitividad y Desarrollo Empresarial, Cámara de Comercio de Medellín.', bold=True)

add_h2('3.1 Sectores tradicionales')
add_table(
    ['Sector', 'Comportamiento'],
    [
        ['Industria', 'Crecimiento 2.3% (venía de 5.6% en 2025)'],
        ['Comercio', 'Crecimiento 13%, empleo positivo'],
        ['Construcción', 'En dificultades (salario mínimo, tasas, subsidios)'],
    ]
)
add_bullet('Índice de confianza del consumidor: positivo (7.3), primera vez desde junio 2022.')
add_bullet('Tendencia mediano plazo: industria 2.4%, comercio 6.5% (ambos sobre promedio nacional).')

add_h2('3.2 Internacionalización')
add_h3('Exportaciones')
add_bullet('Crecimiento 65.4% (oro = ~60% de exportaciones).')
add_bullet('Sin oro: crecimiento del 21%.')
add_bullet('Crecimiento en cantidades y precios (saludable).')
add_bullet('EE.UU. e Italia (50% del mercado) creciendo fuerte.')
add_bullet('Productos de alto valor agregado: crecimientos de 161% y 52% (sostenido).')

add_h3('Inversión extranjera')
add_bullet('Crecimiento 784% al primer trimestre (un proyecto de USD 400 millones).')
add_bullet('A nivel nacional la IED cayó 9%.')

add_h3('Turismo')
add_bullet('Visitantes extranjeros creciendo ~7%.')
add_bullet('Antioquia: 26% de los turistas extranjeros no residentes del país.')

add_h2('3.3 Creación de empresas e inversión')
add_bullet('Decrecimiento 2.1% acumulado (enero afectó por incertidumbre).')
add_bullet('Feb-Mar-Abr: crecimiento positivo sostenido.')
add_bullet('Cancelaciones disminuyeron 1.4%.')
add_bullet('Inversión privada: +1% (6% quitando desinversión atípica).')

add_h2('3.4 Mercado laboral regional')
add_bullet('Se perdieron ~19,000 empleos. Tasa de desempleo subió (venía de 7.9%).')
add_bullet('Antioquia más afectada por mayor nivel de formalidad.')
add_bullet('Mayor impacto en jóvenes.')

add_h2('3.5 Oportunidades: Plataforma de valor global')
add_para('Tres pilares:', bold=True)
add_bullet('Vocaciones productivas: 10 sistemas alimentarios, 69 productos por subregión.')
add_bullet('Infraestructura territorial: Puerto Antioquia (4 puertos en Urabá), corredor Buenaventura-Urabá, red férrea, aeropuerto JMC.')
add_bullet('Valor agregado: de oferta de producto a demanda funcional (aguacate → antioxidantes; cacao → teobromina; lácteos → probióticos).')

add_h2('3.6 Reconocimientos internacionales')
add_bullet('Índice Ciudades Inteligentes (IMD): Medellín = 2ª en LatAm (pos. 121).')
add_bullet('Colombia Tech Report: densidad startups triplicada, mayor en Colombia, mejor ecosistema LatAm (no capitales).')
add_bullet('StartupBlink: pos. 130 de 1,000 (subió 15 posiciones). 6ª en LatAm.')

doc.add_page_break()

# ============================================================
# SECCIÓN 4
# ============================================================
add_h1('4. Sostenibilidad Fiscal')
add_para('Ponente: José Ignacio López — Presidente del Centro de Estudios Económicos de ANIF.', bold=True)

add_h2('4.1 Diagnóstico')
add_bullet('Desde 1991: solo 8 de 35 años con balance primario positivo.')
add_bullet('2024 y 2025: déficits comparables a años de crisis (2020, 1999) sin crisis que lo justifique.')
add_bullet('Deuda neta: niveles solo vistos a finales del siglo XIX (Guerra de los Mil Días).')
add_bullet('Deuda por habitante: de $2 millones (inicios 90s) a $20 millones hoy.')

add_h2('4.2 El problema es de gasto')
add_bullet('Gasto de funcionamiento creciendo mucho más que el gasto de los hogares.')
add_bullet('Estudio ANIF: ajustes basados en reducción de gasto son más exitosos y menos costosos que los basados en impuestos.')

add_h2('4.3 Consecuencias de no actuar')
add_bullet('Déficits primarios >3-4% del PIB persistentes.')
add_bullet('Deuda creciendo ~3 puntos/año → cruza 70% del PIB (insostenible) en 2-3 años.')
add_bullet('Riesgo de hiperinflación (ejemplo Brasil 1982: inflación 100%).')
add_bullet('Impacto: mercado básico mensual de $550,000 a $1,100,000.')

add_h2('4.4 Tamaño del ajuste necesario')
add_para('3 puntos del PIB = ~58-60 billones de pesos', bold=True)
add_table(
    ['Componente', 'Monto'],
    [
        ['Recorte de funcionamiento', '14 billones'],
        ['Recorte de inversión', '27 billones'],
        ['Ingresos adicionales', '12 billones'],
        ['TOTAL', '~58 billones'],
    ]
)

add_h2('4.5 Ineficiencia del gasto')
add_bullet('Últimos 7 años: se crean 8 cargos públicos diarios.')
add_bullet('ANLA: +545% personal, -33% licencias otorgadas.')
add_bullet('DIAN: +10,200 funcionarios desde 2023, no cumplió meta de recaudo (9 billones cortos).')

add_para('Mensaje clave: La llave que abre la sostenibilidad fiscal es que el país crezca más. Meta: convergir a regla fiscal hacia 2032.', bold=True)

doc.add_page_break()

# ============================================================
# SECCIÓN 5
# ============================================================
add_h1('5. Panel: 100 Días para Poner la Casa en Orden')
add_para('Panelistas: Alberto Carrasquilla (exministro de Hacienda), María Claudia Lacouture (AmCham). Moderador: José Ignacio López (ANIF).', bold=True)

add_h2('5.1 Alberto Carrasquilla')
add_para('Si no se hace el ajuste, se lo hacen a uno:', bold=True)
add_bullet('Grecia 2008: un ajuste de 2 puntos a tiempo habría ahorrado un costo de 8 puntos del PIB.')
add_bullet('Probabilidad de "sustico" financiero (subastas fallidas) en menos de 2 años.')

add_para('Acciones prioritarias:', bold=True)
add_bullet('Marco fiscal de mediano plazo y presupuesto (junio): marcar un antes y después.')
add_bullet('Reforma del SGP: debe salir bien.')
add_bullet('Cuantificar deuda oculta del sector salud.')
add_bullet('Venta de activos del Estado para generar caja.')

add_h2('5.2 María Claudia Lacouture')
add_para('Legitimidad fiscal = Confianza', bold=True)
add_quote('El gobierno no tiene recursos propios, se los quita a la gente.')

add_para('Tres acciones en los primeros 100 días:', bold=True)
add_bullet('SINCERAR: Transparentar el presupuesto real.')
add_bullet('PRIORIZAR: Gastar mejor. ¿Protege a quien lo necesita? ¿Genera productividad? ¿Es eficiente?')
add_bullet('DESTRABAR: Prender motores de desarrollo y empleo.')

add_para('Sobre inversión extranjera:', bold=True)
add_bullet('Colombia = "mejor lote del hemisferio" pero sin agua, luz ni divisiones.')
add_bullet('De USD 189 billones que llegaron a LatAm, Colombia solo recibió 7%.')
add_bullet('Inversión de EE.UU. cayó 38% en 2025. Capital fresco cayó 27%.')
add_bullet('81% de ingresos del Estado viene de empresas.')
add_bullet('La inversión pide: reglas de juego estables, transparencia, consenso.')

add_h2('5.3 Señales de alerta')
add_bullet('Tasas de TES a corto plazo superando el 15%.')
add_bullet('Dominancia fiscal: tasas de deuda pública arrastran toda la economía.')
add_bullet('Aumento global en tasas de largo plazo esta semana.')

doc.add_page_break()

# ============================================================
# SECCIÓN 6
# ============================================================
add_h1('6. Panel: Sistema de Salud')
add_para('Panelistas: Ramón Abel Castaño (consultor), Irma Echeverri (EPS Sura). Moderadora: Luz Magdalena Salas (ANIF).', bold=True)

add_h2('6.1 Diagnóstico')
add_bullet('Crisis profundizándose desde ~2010, acelerada últimos 4 años por desfinanciamiento de la UPC.')
add_bullet('Gasto de bolsillo aumentó 40%.')
add_bullet('Deuda oculta del sistema: ~40 billones de pesos.')

add_h2('6.2 Qué preservar')
add_bullet('Protección financiera (gasto de bolsillo bajo era logro clave).')
add_bullet('Concepto de aseguramiento (gestión de riesgo financiero, operativo, de salud).')
add_bullet('Inyección urgente de caja (~10 billones en primeros 3 meses).')

add_h2('6.3 Cambios estructurales')
add_bullet('Gasto evitable: OMS estima 20-40% del gasto en salud es desperdicio.')
add_bullet('Dos dimensiones: sobreuso de tecnología + morbilidad evitable.')
add_bullet('Priorización: equilibrar beneficio individual vs. bienestar colectivo.')
add_bullet('Ningún candidato tiene política explícita sobre mejora de procesos de producción de servicios.')

add_h2('6.4 No negociables para reforma')
add_table(
    ['Irma Echeverri (EPS Sura)', 'Ramón Abel Castaño'],
    [
        ['Reorganización del aseguramiento', 'Participación del sector privado'],
        ['Atención primaria en salud', 'Libertad de elección'],
        ['Territorialización de la salud', 'Equilibrio individual/colectivo'],
        ['Modelo operativo eficiente', ''],
    ]
)

doc.add_page_break()

# ============================================================
# SECCIÓN 7
# ============================================================
add_h1('7. Panel: Infraestructura y Vivienda')
add_para('Panelistas: Juan David Pérez (Cámara Infraestructura Antioquia), Hernán Muñoz (Convel). Moderador: Jesús Botero (EAFIT).', bold=True)

add_h2('7.1 La construcción: apuesta ganadora con 5 frentes')
add_bullet('Genera demanda (impulso económico).')
add_bullet('Genera empleo y encadenamientos productivos.')
add_bullet('Construye capital (infraestructura, vivienda).')
add_bullet('Mejora productividad (competitividad exportadora).')
add_bullet('Genera bienestar (vivienda propia).')

add_h2('7.2 Cifras críticas')
add_bullet('PIB construcción: -2.7% en 2025, -5.4% arranque 2026.')
add_bullet('Infraestructura: de 18 billones (2019) a 12 billones (35% por debajo).')
add_bullet('Inversión en vivienda: de 5% del PIB (2015-2019) a 3.1% actual.')

add_h2('7.3 Infraestructura')
add_para('El problema no es de inventario ni financiación, sino de voluntad:', bold=True)
add_bullet('44 APPs por ~100 billones de pesos detenidas.')
add_bullet('Hostilidad hacia inversión privada.')
add_bullet('Deudas Invías: 1.2 billones vencidas + 1.3 billones vigencias futuras.')
add_bullet('Laudo Ruta al Mar: 3.5 billones contra la nación.')

add_para('Oportunidades:', bold=True)
add_bullet('25 billones en iniciativas para aeropuertos.')
add_bullet('Obras por impuestos.')
add_bullet('Gobiernos locales (Medellín + Antioquia): 18 billones al 2030.')
add_bullet('Fondo Horizontes: ~$400,000 millones anuales.')

add_h2('7.4 Vivienda')
add_bullet('Subsidios NO son gasto, son inversión con factor multiplicador alto.')
add_bullet('Se revierten al Estado en ingresos posteriores.')
add_bullet('Dinamizar ahorro e inversión desde el sector.')

doc.add_page_break()

# ============================================================
# SECCIÓN 8
# ============================================================
add_h1('8. Panel: Energía — Entre la Transición y la Autonomía')
add_para('Panelistas: Katrin Simancas (Andesco), Ricardo Sierra (CEO Celsia). Moderador: Jaime Arenas (Clúster Energía Sostenible).', bold=True)

add_h2('8.1 Transición vs. Autoabastecimiento')
add_bullet('Falso dilema: no puede haber transición sin autoabastecimiento.')
add_bullet('La transición es un camino, no un objetivo. Meta: matriz diversificada.')
add_bullet('Trilema energético: seguridad + sostenibilidad + asequibilidad.')
add_bullet('Colombia perdió autoabastecimiento de gas natural.')

add_h2('8.2 Fenómeno del Niño — Situación crítica')
add_bullet('Probabilidad agosto-octubre: 98%. Más de 50% severo/muy severo.')
add_bullet('4.4% de demanda proyectada no se puede cubrir con energía en firme.')
add_bullet('Colombia llega POR PRIMERA VEZ a un Niño sin suficiencia de gas natural.')
add_bullet('Un apagón puede costar 1-1.5 puntos del PIB.')

add_h2('8.3 Propuestas')
add_para('Plan de choque (Andesco):', bold=True)
add_bullet('Resolver crisis física y financiera: pagar deudas, Conpes de 6 billones para Air.')
add_bullet('Comité de seguridad energética presidencial.')
add_bullet('Recuperar confianza: independencia regulatoria, reglas claras.')
add_bullet('Modernización: baterías, tarifas horarias, flexibilidad de conexión.')

add_para('Tendencias (Celsia):', bold=True)
add_bullet('Electrificación de todo, movilidad eléctrica, data centers/IA.')
add_bullet('Baterías: "santo grial" de la industria. Subasta en un par de meses.')
add_bullet('Modelo Texas para conexión: generadores asumen riesgo (resolvió en 3 años).')
add_bullet('Racionamiento silencioso en ciudades: no hay dónde conectar proyectos.')

add_para('Mensaje final: "Dejar de hablar de transición y hablar de aceleración."', bold=True)

doc.add_page_break()

# ============================================================
# SECCIÓN 9
# ============================================================
add_h1('9. Panel: Minería Responsable como Motor de Desarrollo')
add_para('Panelista: Silvana Abib Daza (Asoenergía, expresidenta Agencia Nacional de Minería). Moderador: Diego Vargas (El Colombiano).', bold=True)

add_h2('9.1 Contexto')
add_bullet('IED en minería cayendo 53% (vs. 14% general).')
add_bullet('PIB minero: caída 8-10% en este gobierno.')
add_bullet('A pesar de precios históricos del oro.')

add_h2('9.2 Propuestas para el próximo gobierno')
add_bullet('Reconocer minería como industria legítima y brazo de transición energética/reindustrialización.')
add_bullet('Seguridad jurídica: "El inversionista no le tiene miedo a la regla, le tiene miedo a la incertidumbre."')
add_bullet('Agilidad institucional: fiscalizar sin generar moratoria de facto.')
add_bullet('Coordinación institucional (PINES 2.0): ventanilla única, comité presidencial.')
add_bullet('Definir si Colombia quiere participar en la transición global (proveer minerales críticos).')
add_bullet('Carbón como fuente de respaldo para fenómeno del Niño.')

add_h2('9.3 Minerales críticos')
add_bullet('Colombia tiene potencial enorme pero está rezagada vs. Argentina y Brasil.')
add_bullet('Rondas recientes (fosfato, cobre) apenas en proceso.')
add_bullet('Proyectos avanzados sin impulso real.')
add_bullet('Baja inversión = baja exploración = país rezagado a futuro.')

doc.add_page_break()

# ============================================================
# SECCIÓN 10
# ============================================================
add_h1('10. Cierre: Liderazgo para la Democracia y la Competitividad')
add_para('Ponente: Antonio Celia Martínez Aparicio (empresario, expresidente Promigas). Moderador: César Tamayo Tobón (EAFIT).', bold=True)

add_h2('10.1 El mal hábito de aplazar problemas')
add_bullet('ELN en 1973: 250 personas. Se dejó crecer.')
add_bullet('Misiones (empleo, internacionalización, sabios 1994): extraordinarias, no implementadas.')
add_bullet('Dos políticas de desarrollo productivo que los empresarios desconocen.')

add_para('¿Por qué?', bold=True)
add_bullet('Ambigüedad (confundimos metas con medios).')
add_bullet('Retórica (mucho verbo, poca medición).')
add_bullet('Maximalismo (queremos resolver todo de un trancazo).')

add_h2('10.2 La solución: Pactos pequeños, concretos y medibles')
add_para('Características de un buen pacto:', bold=True)
add_bullet('Particular (no todo a la vez).')
add_bullet('Medible (indicadores concretos).')
add_bullet('Ambicioso pero lograble.')
add_bullet('Con verificación y veeduría ciudadana.')

add_para('Ejemplo exitoso — Barranquilla:', bold=True)
add_table(
    ['Aspecto', 'Resultado'],
    [
        ['Pacto fiscal', 'Recaudo: de $850,000 millones (2008) a +$4 billones (hoy)'],
        ['Pacto por educación', 'De 14 colegios categoría A a 23 en 5 años'],
    ]
)
add_bullet('Claves: voluntad política + centro de pensamiento + confianza tangible + sociedad civil empoderada.')

add_h2('10.3 Propuestas concretas')
add_bullet('Pacto fiscal liderado por empresarios (no esperar al gobierno).')
add_bullet('Pacto educación medible: subir 20 puestos en PISA en 5 años.')
add_bullet('"Mango bajito": comprensión lectora (más de la mitad de niños de 10 años no entiende lo que lee).')
add_bullet('Universidades adopten 3-4 pactos cada una.')

add_h2('10.4 Mensaje final')
add_quote('Este país es un mejor país que hace 30 o 40 años. Estamos en una coyuntura particular de hostilidad hacia el sector privado, pero en general Colombia ha avanzado mucho. Solo que necesitamos avanzar más rápido y mejor. Si nos proponemos, se puede.')

doc.add_page_break()

# ============================================================
# RESUMEN EJECUTIVO
# ============================================================
add_h1('11. Resumen Ejecutivo')

add_h2('Diagnóstico general')
add_bullet('Colombia crece al 2.2% (insuficiente), impulsada por gasto público (insostenible).')
add_bullet('Crisis fiscal seria: déficit primario récord, deuda en niveles del siglo XIX.')
add_bullet('Inflación acelerándose (5.7%) a contracorriente de la región.')
add_bullet('Fenómeno del Niño inminente (probable super Niño) sin suficiencia energética.')
add_bullet('Inversión estancada en 16-17% del PIB (se necesita +22%).')

add_h2('Oportunidades')
add_bullet('Antioquia creciendo por encima del promedio nacional.')
add_bullet('Exportaciones disparadas (65% con oro, 21% sin oro).')
add_bullet('Ecosistema de innovación de talla mundial (Medellín 2ª ciudad inteligente LatAm).')
add_bullet('Plataforma de valor global en agroindustria.')
add_bullet('Condiciones externas no desfavorables (commodities, socio EE.UU.).')

add_h2('Hoja de ruta — Primeros 100 días del nuevo gobierno')
add_table(
    ['Frente', 'Acción prioritaria'],
    [
        ['Fiscal', 'Ajuste 3 puntos PIB (58 billones): austeridad + crecimiento. Presupuesto creíble.'],
        ['Confianza', 'Sincerar cuentas, transparentar presupuesto, señales pro-inversión.'],
        ['Salud', 'Inyección caja (~10 billones), reorganizar aseguramiento, ajustar UPC.'],
        ['Energía', 'Comité presidencial seguridad energética, pagar deudas, subasta baterías.'],
        ['Infraestructura', 'Destrabar APPs, reforma ley APP, certidumbre jurídica.'],
        ['Vivienda', 'Subsidios como inversión (no gasto), reactivar Mi Casa Ya.'],
        ['Minería', 'Política de Estado, ventanilla única, estabilidad jurídica, minerales críticos.'],
        ['Crecimiento', 'Sin crecimiento no hay solución fiscal. Señales a inversión.'],
    ]
)

add_h2('Frase del foro')
add_quote('Sin empresas no hay país.')

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('— Fin del documento —')
run.italic = True
run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('Documento organizado a partir de la transcripción del foro.\nLos datos y cifras corresponden a lo presentado por los ponentes durante el evento.')
run.font.size = Pt(9)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

# --- GUARDAR ---
output_path = r'c:\Users\HP\OneDrive\Escritorio\Bistro\docs_externos\Perspectivas_Economicas_2026.docx'
doc.save(output_path)
print(f'Documento guardado en: {output_path}')
