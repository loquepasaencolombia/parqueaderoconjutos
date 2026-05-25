// ===== PERSISTENCIA DE DATOS (Electron IPC) =====
const { ipcRenderer } = require('electron');

async function guardarDatos() {
    try {
        await ipcRenderer.invoke('guardar-datos', JSON.parse(JSON.stringify(state)));
    } catch (e) {
        console.error('Error guardando datos:', e);
    }
}

async function cargarDatos() {
    try {
        const resultado = await ipcRenderer.invoke('cargar-datos');
        if (resultado.success && resultado.datos) {
            const datos = resultado.datos;
            if (datos.config) state.config = datos.config;
            if (datos.ticketConfig) state.ticketConfig = datos.ticketConfig;
            if (datos.residentes) state.residentes = datos.residentes;
            if (datos.camaras) state.camaras = datos.camaras;
            if (datos.vehiculosDentro) state.vehiculosDentro = datos.vehiculosDentro;
            if (datos.historial) state.historial = datos.historial;
            if (datos.alertas) state.alertas = datos.alertas;
            if (datos.licencia) state.licencia = datos.licencia;
            return true;
        }
    } catch (e) {
        console.error('Error cargando datos:', e);
    }
    return false;
}

// Auto-guardado cada 30 segundos
setInterval(guardarDatos, 30000);
// ===== STATE =====
const state = {
    user: null,
    config: {
        cuposCarros: 150,
        cuposMotos: 300,
        tiempoResidentes: 0,
        tiempoVisitantes: 0,
        tiempoAirbnb: 0,
        tarifaHora: 3000,
        alertaNoReg: 300,
        usuario: 'admin',
        clave: 'admin123'
    },
    ticketConfig: {
        nombre: 'Unidad Residencial',
        nit: 'NIT',
        telefono: '',
        direccion: '',
        correo: 'correo@dominio.com',
        mensaje: 'Gracias por su pago. Conserve este comprobante.',
        logo: null
    },
    residentes: [
        { placa: 'ABC-123', propietario: 'Residente ejemplo', apartamento: 'Torre 1 Apto 502', tipo: 'carro', documento: '123456', telefono: '', rostro_id: 'FACE-001' },
        { placa: 'XYZ-12A', propietario: 'Residente moto', apartamento: 'Torre 2 Apto 804', tipo: 'moto', documento: '654321', telefono: '', rostro_id: 'FACE-002' }
    ],
    camaras: [
        { nombre: 'Entrada principal LPR', tipo: 'LPR Entrada', marca: 'Hikvision', url: 'rtsp://192.168.1.10', usuario: '', clave: '', estado: 'Lista' },
        { nombre: 'Facial porteria', tipo: 'Facial', marca: 'ONVIF', url: 'rtsp://192.168.1.11', usuario: '', clave: '', estado: 'Lista' }
    ],
    vehiculosDentro: [],
    historial: [],
    alertas: [],
    currentSalida: null,
    editingResidente: null,
    historialSearch: ''
};

// ===== UTILS =====
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('es-CO');
}
function formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('es-CO');
}
function formatDateTime(date) {
    return formatDate(date) + ', ' + formatTime(date);
}
function formatDateTimeLocal(date) {
    const pad = n => n.toString().padStart(2, '0');
    const d = new Date(date);
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function calcularTiempoMinutos(inicio, fin) {
    return Math.floor((new Date(fin) - new Date(inicio)) / (1000 * 60));
}
function calcularTiempoHoras(inicio, fin) {
    return calcularTiempoMinutos(inicio, fin) / 60;
}
function minutosATexto(minutos) {
    const d = Math.floor(minutos / 1440);
    const h = Math.floor((minutos % 1440) / 60);
    const m = minutos % 60;
    let texto = '';
    if (d > 0) texto += d + 'd ';
    if (h > 0 || d > 0) texto += h + 'h ';
    texto += (m < 10 ? '0' : '') + m + 'm';
    return texto;
}
function minutosATextoConfig(minutos) {
    const d = Math.floor(minutos / 1440);
    const h = Math.floor((minutos % 1440) / 60);
    const m = minutos % 60;
    let texto = '';
    if (d > 0) texto += d + ' dia' + (d > 1 ? 's' : '') + ' ';
    if (h > 0) texto += h + 'h ';
    if (m > 0) texto += m + 'min';
    return texto || '0 min';
}
function textoAMinutos(dias, horas, minutos) {
    return (parseInt(dias || 0) * 1440) + (parseInt(horas || 0) * 60) + parseInt(minutos || 0);
}
function calcularCobro(vehiculo, minutos) {
    if (vehiculo.modalidad === 'residente') {
        // Si no hay tiempo configurado (0), no cobrar nada
        if (state.config.tiempoResidentes <= 0) return 0;
        if (minutos <= state.config.tiempoResidentes) return 0;
        const horasExtra = Math.ceil((minutos - state.config.tiempoResidentes) / 60);
        return horasExtra * state.config.tarifaHora;
    }
    if (vehiculo.modalidad === 'visitante') {
        // Si no hay tiempo configurado (0), no cobrar nada
        if (state.config.tiempoVisitantes <= 0) return 0;
        if (minutos <= state.config.tiempoVisitantes) return 0;
        const horasExtra = Math.ceil((minutos - state.config.tiempoVisitantes) / 60);
        return horasExtra * state.config.tarifaHora;
    }
    if (vehiculo.modalidad === 'airbnb') {
        if (vehiculo.airbnb && vehiculo.airbnb.salidaAutorizada) {
            const salidaAut = new Date(vehiculo.airbnb.salidaAutorizada);
            const ahora = new Date();
            if (ahora <= salidaAut) return 0;
            const minutosExtra = Math.floor((ahora - salidaAut) / (1000 * 60));
            const horasExtra = Math.ceil(minutosExtra / 60);
            return horasExtra * state.config.tarifaHora;
        }
        return 0;
    }
    return 0;
}

// ===== LOGIN =====
function doLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    if (user === state.config.usuario && pass === state.config.clave) {
        state.user = user;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        updateDashboard();
        startAlertTimer();
    } else {
        alert('Usuario o contrasena incorrectos');
    }
}
function doLogout() {
    state.user = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-user').value = 'admin';
    document.getElementById('login-pass').value = '';
}

// ===== NAVIGATION =====
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('section-' + sectionId).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (event && event.target) {
        event.target.closest('.nav-item').classList.add('active');
    }
    const titles = {
        dashboard: ['Dashboard', 'Control de carros, motos, residentes, visitantes, Airbnb, facial, alertas, cobros y tiquetera.'],
        ingreso: ['Ingreso automatico LPR', 'La placa puede llegar desde camara LPR. Aqui se simula para prueba local.'],
        vehiculos: ['Vehiculos dentro', 'Control de carros, motos, residentes, visitantes, Airbnb, facial, alertas, cobros y tiquetera.'],
        residentes: ['Residentes / Excel CSV', 'Control de carros, motos, residentes, visitantes, Airbnb, facial, alertas, cobros y tiquetera.'],
        camaras: ['Camaras LPR / Facial', 'Control de carros, motos, residentes, visitantes, Airbnb, facial, alertas, cobros y tiquetera.'],
        ticket: ['Ticket de cobro', 'Control de carros, motos, residentes, visitantes, Airbnb, facial, alertas, cobros y tiquetera.'],
        historial: ['Historial completo', 'Registro historico de todos los vehiculos.'],
        alertas: ['Alertas', 'Alertas del sistema en tiempo real.'],
        config: ['Configuracion', 'Control de carros, motos, residentes, visitantes, Airbnb, facial, alertas, cobros y tiquetera.'],
        disponibilidad: ['Pantalla de disponibilidad', 'Visualizacion de cupos disponibles para proyeccion en pantalla.']
    };
    document.getElementById('page-title').textContent = titles[sectionId][0];
    document.getElementById('page-subtitle').textContent = titles[sectionId][1];
    if (sectionId === 'dashboard') updateDashboard();
    if (sectionId === 'vehiculos') renderVehiculosDentro();
    if (sectionId === 'residentes') renderResidentes();
    if (sectionId === 'camaras') renderCamaras();
    if (sectionId === 'historial') renderHistorial();
    if (sectionId === 'alertas') renderAlertas();
    if (sectionId === 'ticket') renderTicketLists();
    if (sectionId === 'config') cargarConfigForm();
    if (sectionId === 'disponibilidad') renderDisponibilidad();
}

// ===== MODALIDAD CHANGE =====
function onModalidadChange() {
    const modalidad = document.getElementById('ingreso-modalidad').value;
    const airbnbFields = document.getElementById('airbnb-fields');
    const tiempoFields = document.getElementById('tiempo-autorizado-fields');

    if (modalidad === 'airbnb') {
        airbnbFields.classList.remove('hidden');
        tiempoFields.classList.add('hidden');
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        document.getElementById('airbnb-ingreso').value = formatDateTimeLocal(now);
        document.getElementById('airbnb-salida').value = formatDateTimeLocal(tomorrow);
    } else {
        airbnbFields.classList.add('hidden');
        tiempoFields.classList.remove('hidden');
        if (modalidad === 'residente') {
            setTiempoFromMinutos(state.config.tiempoResidentes);
        } else if (modalidad === 'visitante') {
            setTiempoFromMinutos(state.config.tiempoVisitantes);
        }
    }
}

function setTiempoFromMinutos(minutos) {
    const d = Math.floor(minutos / 1440);
    const h = Math.floor((minutos % 1440) / 60);
    const m = minutos % 60;
    document.getElementById('ingreso-dias').value = d;
    document.getElementById('ingreso-horas').value = h;
    document.getElementById('ingreso-minutos').value = m;
}

function getTiempoMinutos() {
    const d = parseInt(document.getElementById('ingreso-dias').value) || 0;
    const h = parseInt(document.getElementById('ingreso-horas').value) || 0;
    const m = parseInt(document.getElementById('ingreso-minutos').value) || 0;
    return textoAMinutos(d, h, m);
}

// ===== SIMULAR LPR =====
function simularLPR() {
    const placas = ['ABC-123', 'XYZ-12A', 'BBB-456', 'MNO-789', 'AAA-111', 'ZZZ-999', 'CCC-777', 'DDD-888'];
    const placa = placas[Math.floor(Math.random() * placas.length)];
    document.getElementById('plate-display').textContent = placa;
    document.getElementById('ingreso-placa').value = placa;
    const residente = state.residentes.find(r => r.placa.toUpperCase() === placa.toUpperCase());
    if (residente) {
        document.getElementById('ingreso-modalidad').value = 'residente';
        document.getElementById('ingreso-tipo').value = residente.tipo;
        document.getElementById('ingreso-destino').value = residente.apartamento;
        document.getElementById('ingreso-conductor').value = residente.propietario;
        onModalidadChange();
    }
}

// ===== REGISTRAR INGRESO =====
function registrarIngreso() {
    const placa = document.getElementById('ingreso-placa').value.trim().toUpperCase();
    const tipo = document.getElementById('ingreso-tipo').value;
    const modalidad = document.getElementById('ingreso-modalidad').value;
    const destino = document.getElementById('ingreso-destino').value.trim();
    const conductor = document.getElementById('ingreso-conductor').value.trim();
    const facial = document.getElementById('ingreso-facial').value;

    if (!placa) { alert('Ingrese la placa'); return; }
    if (state.vehiculosDentro.find(v => v.placa === placa)) {
        alert('Este vehiculo ya esta dentro del parqueadero'); return;
    }

    const cupos = tipo === 'carro' ? state.config.cuposCarros : state.config.cuposMotos;
    const dentroTipo = state.vehiculosDentro.filter(v => v.tipo === tipo).length;
    if (dentroTipo >= cupos) {
        alert('No hay cupos disponibles para ' + tipo + 's'); return;
    }

    const now = new Date();
    const vehiculo = {
        id: Date.now(),
        placa, tipo, modalidad, destino,
        conductor: conductor || 'No registrado',
        ingreso: now,
        facial,
        alerta: false,
        alertaVista: false
    };

    if (modalidad === 'airbnb') {
        const ingresoAut = document.getElementById('airbnb-ingreso').value;
        const salidaAut = document.getElementById('airbnb-salida').value;
        const documento = document.getElementById('airbnb-documento').value.trim();
        const telefono = document.getElementById('airbnb-telefono').value.trim();
        if (!ingresoAut || !salidaAut) {
            alert('Debe ingresar fecha y hora de ingreso y salida autorizadas para Airbnb'); return;
        }
        vehiculo.airbnb = {
            ingresoAutorizado: new Date(ingresoAut),
            salidaAutorizada: new Date(salidaAut),
            documento, telefono
        };
        vehiculo.minutosAutorizados = null;
    } else {
        vehiculo.minutosAutorizados = getTiempoMinutos();
    }

    state.vehiculosDentro.push(vehiculo);
    updateDashboard();
    renderVehiculosDentro();
    limpiarIngreso();
    alert('Ingreso registrado correctamente.');
}

function limpiarIngreso() {
    document.getElementById('ingreso-placa').value = '';
    document.getElementById('ingreso-destino').value = '';
    document.getElementById('ingreso-conductor').value = '';
    document.getElementById('ingreso-dias').value = '0';
    document.getElementById('ingreso-horas').value = '5';
    document.getElementById('ingreso-minutos').value = '0';
    document.getElementById('plate-display').textContent = 'AAA-123';
    document.getElementById('airbnb-fields').classList.add('hidden');
    document.getElementById('tiempo-autorizado-fields').classList.remove('hidden');
    document.getElementById('ingreso-modalidad').value = 'residente';
    onModalidadChange();
}

// ===== TICKET GENERATION =====
function generarTicketEntrada(vehiculo) {
    const tc = state.ticketConfig;
    let contenido = '<div class="ticket-header"><h4>' + tc.nombre + '</h4><p>' + tc.nit + '</p>';
    if (tc.direccion) contenido += '<p>' + tc.direccion + '</p>';
    if (tc.telefono) contenido += '<p>Tel: ' + tc.telefono + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-body"><p><strong>TICKET DE ENTRADA</strong></p>';
    contenido += '<p>Placa: ' + vehiculo.placa + '</p>';
    contenido += '<p>Tipo: ' + vehiculo.tipo + '</p>';
    contenido += '<p>Modalidad: ' + capitalize(vehiculo.modalidad) + '</p>';
    contenido += '<p>Destino: ' + (vehiculo.destino || 'N/A') + '</p>';
    contenido += '<p>Conductor: ' + vehiculo.conductor + '</p>';
    contenido += '<p>Ingreso: ' + formatDateTime(vehiculo.ingreso) + '</p>';
    if (vehiculo.modalidad === 'airbnb' && vehiculo.airbnb) {
        contenido += '<p>Salida autorizada: ' + formatDateTime(vehiculo.airbnb.salidaAutorizada) + '</p>';
    } else {
        contenido += '<p>Tiempo autorizado: ' + minutosATexto(vehiculo.minutosAutorizados) + '</p>';
    }
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-footer"><p>' + tc.mensaje + '</p></div>';
    mostrarTicket(contenido);
}

function generarTicketSalida(vehiculo, cobro, minutos) {
    const tc = state.ticketConfig;
    const salida = new Date();

    // Calcular tiempos desglosados
    let tiempoGratis = 0;
    let tiempoExtra = 0;
    let horasExtra = 0;

    if (vehiculo.modalidad === 'residente') {
        tiempoGratis = state.config.tiempoResidentes;
        if (minutos > tiempoGratis) {
            tiempoExtra = minutos - tiempoGratis;
            horasExtra = Math.ceil(tiempoExtra / 60);
        }
    } else if (vehiculo.modalidad === 'visitante') {
        tiempoGratis = state.config.tiempoVisitantes;
        if (minutos > tiempoGratis) {
            tiempoExtra = minutos - tiempoGratis;
            horasExtra = Math.ceil(tiempoExtra / 60);
        }
    } else if (vehiculo.modalidad === 'airbnb' && vehiculo.airbnb) {
        const salidaAut = new Date(vehiculo.airbnb.salidaAutorizada);
        if (salida > salidaAut) {
            tiempoExtra = Math.floor((salida - salidaAut) / (1000 * 60));
            horasExtra = Math.ceil(tiempoExtra / 60);
        }
    }

    let contenido = '<div class="ticket-header"><h4>' + tc.nombre + '</h4><p>' + tc.nit + '</p>';
    if (tc.direccion) contenido += '<p>' + tc.direccion + '</p>';
    if (tc.telefono) contenido += '<p>Tel: ' + tc.telefono + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-body"><p><strong>TICKET DE COBRO</strong></p>';
    contenido += '<p>Placa: ' + vehiculo.placa + '</p>';
    contenido += '<p>Tipo: ' + vehiculo.tipo + '</p>';
    contenido += '<p>Modalidad: ' + capitalize(vehiculo.modalidad) + '</p>';
    contenido += '<p>Apto/Destino: ' + (vehiculo.destino || 'N/A') + '</p>';
    contenido += '<p>Ingreso: ' + formatDateTime(vehiculo.ingreso) + '</p>';
    contenido += '<p>Salida: ' + formatDateTime(salida) + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-body"><p><strong>DESGLOSE DE TIEMPO</strong></p>';
    contenido += '<p>Tiempo total: ' + minutosATexto(minutos) + '</p>';
    if (vehiculo.modalidad === 'airbnb' && vehiculo.airbnb) {
        contenido += '<p>Salida autorizada: ' + formatDateTime(vehiculo.airbnb.salidaAutorizada) + '</p>';
    } else {
        contenido += '<p>Tiempo autorizado (gratis): ' + minutosATexto(tiempoGratis) + '</p>';
    }
    if (tiempoExtra > 0) {
        contenido += '<p style="color:#ef4444;"><strong>Tiempo extra: ' + minutosATexto(tiempoExtra) + '</strong></p>';
        contenido += '<p>Horas extra a cobrar: ' + horasExtra + 'h</p>';
    }
    contenido += '<p>Tarifa/hora: $' + state.config.tarifaHora.toLocaleString() + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    if (cobro > 0) {
        contenido += '<div class="ticket-total"><p><strong>Total a pagar: $' + cobro.toLocaleString() + '</strong></p></div>';
    } else {
        contenido += '<div class="ticket-total"><p><strong>Sin cobro - Dentro del tiempo autorizado</strong></p></div>';
    }
    contenido += '<div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-footer"><p>' + tc.mensaje + '</p></div>';
    mostrarTicket(contenido);
}

function mostrarTicket(contenido) {
    document.getElementById('ticket-print-content').innerHTML = contenido;
    document.getElementById('ticket-modal').classList.remove('hidden');
}
function cerrarTicket() {
    document.getElementById('ticket-modal').classList.add('hidden');
}

// ===== SALIDA =====
function prepararSalida(id) {
    const vehiculo = state.vehiculosDentro.find(v => v.id === id);
    if (!vehiculo) return;
    state.currentSalida = vehiculo;
    const ahora = new Date();
    const minutos = calcularTiempoMinutos(vehiculo.ingreso, ahora);
    const cobro = calcularCobro(vehiculo, minutos);

    // Calcular desglose
    let tiempoGratis = 0;
    let tiempoExtra = 0;
    let horasExtra = 0;

    if (vehiculo.modalidad === 'residente') {
        tiempoGratis = state.config.tiempoResidentes;
        if (minutos > tiempoGratis) {
            tiempoExtra = minutos - tiempoGratis;
            horasExtra = Math.ceil(tiempoExtra / 60);
        }
    } else if (vehiculo.modalidad === 'visitante') {
        tiempoGratis = state.config.tiempoVisitantes;
        if (minutos > tiempoGratis) {
            tiempoExtra = minutos - tiempoGratis;
            horasExtra = Math.ceil(tiempoExtra / 60);
        }
    } else if (vehiculo.modalidad === 'airbnb' && vehiculo.airbnb) {
        const salidaAut = new Date(vehiculo.airbnb.salidaAutorizada);
        if (ahora > salidaAut) {
            tiempoExtra = Math.floor((ahora - salidaAut) / (1000 * 60));
            horasExtra = Math.ceil(tiempoExtra / 60);
        }
    }

    let info = '<p><strong>Placa:</strong> ' + vehiculo.placa + '</p>';
    info += '<p><strong>Tipo:</strong> ' + vehiculo.tipo + '</p>';
    info += '<p><strong>Modalidad:</strong> ' + capitalize(vehiculo.modalidad) + '</p>';
    info += '<p><strong>Destino:</strong> ' + (vehiculo.destino || 'N/A') + '</p>';
    info += '<p><strong>Ingreso:</strong> ' + formatDateTime(vehiculo.ingreso) + '</p>';
    info += '<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0;">';
    info += '<p><strong>Tiempo total dentro:</strong> ' + minutosATexto(minutos) + '</p>';
    if (vehiculo.modalidad === 'airbnb' && vehiculo.airbnb) {
        info += '<p><strong>Salida autorizada:</strong> ' + formatDateTime(vehiculo.airbnb.salidaAutorizada) + '</p>';
    } else {
        info += '<p><strong>Tiempo gratis autorizado:</strong> ' + minutosATexto(tiempoGratis) + '</p>';
    }
    if (tiempoExtra > 0) {
        info += '<p style="color:#ef4444;"><strong>Tiempo extra:</strong> ' + minutosATexto(tiempoExtra) + ' (' + horasExtra + 'h cobrables)</p>';
    }
    info += '<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0;">';
    info += '<p style="font-size:18px;"><strong>Cobro total: $' + cobro.toLocaleString() + '</strong></p>';

    document.getElementById('salida-info').innerHTML = info;
    document.getElementById('salida-modal').classList.remove('hidden');
}
function cerrarSalida() {
    document.getElementById('salida-modal').classList.add('hidden');
    state.currentSalida = null;
}
function confirmarSalida() {
    if (!state.currentSalida) return;
    const vehiculo = state.currentSalida;
    const ahora = new Date();
    const minutos = calcularTiempoMinutos(vehiculo.ingreso, ahora);
    const cobro = calcularCobro(vehiculo, minutos);

    const registro = {
        id: vehiculo.id,
        placa: vehiculo.placa,
        tipo: vehiculo.tipo,
        modalidad: vehiculo.modalidad,
        conductor: vehiculo.conductor,
        destino: vehiculo.destino,
        ingreso: vehiculo.ingreso,
        salida: ahora,
        minutos: minutos,
        tiempoHoras: minutos / 60,
        cobro: cobro,
        alerta: vehiculo.alerta,
        alertaVista: vehiculo.alertaVista
    };
    state.historial.unshift(registro);

    state.vehiculosDentro = state.vehiculosDentro.filter(v => v.id !== vehiculo.id);

    generarTicketSalida(vehiculo, cobro, minutos);

    updateDashboard();
    renderVehiculosDentro();
    renderHistorial();
    renderTicketLists();
    cerrarSalida();
}

// ===== DASHBOARD =====
function updateDashboard() {
    const carrosDentro = state.vehiculosDentro.filter(v => v.tipo === 'carro').length;
    const motosDentro = state.vehiculosDentro.filter(v => v.tipo === 'moto').length;
    const carrosDisp = state.config.cuposCarros - carrosDentro;
    const motosDisp = state.config.cuposMotos - motosDentro;

    document.getElementById('stat-carros-dentro').textContent = carrosDentro;
    document.getElementById('stat-carros-disp').textContent = carrosDisp;
    document.getElementById('stat-carros-ocup').textContent = ((carrosDentro / state.config.cuposCarros) * 100).toFixed(1) + '%';
    document.getElementById('stat-motos-dentro').textContent = motosDentro;
    document.getElementById('stat-motos-disp').textContent = motosDisp;
    document.getElementById('stat-motos-ocup').textContent = ((motosDentro / state.config.cuposMotos) * 100).toFixed(1) + '%';

    const alertasActivas = state.alertas.filter(a => !a.vista);
    const badge = document.getElementById('alert-badge');
    if (alertasActivas.length > 0) {
        badge.textContent = alertasActivas.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    const alertList = document.getElementById('dashboard-alertas');
    if (alertasActivas.length === 0) {
        alertList.innerHTML = '<p class="empty">Sin alertas activas.</p>';
    } else {
        alertList.innerHTML = alertasActivas.slice(0, 5).map(a => 
            '<div class="alert-item ' + a.tipo + '"><span class="alert-text">' + a.mensaje + '</span><span class="alert-time">' + formatTime(a.fecha) + '</span></div>'
        ).join('');
    }

    const recent = state.vehiculosDentro.slice(-5).reverse();
    const tbody = document.getElementById('ultimos-ingresos');
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">Sin ingresos recientes</td></tr>';
    } else {
        tbody.innerHTML = recent.map(v => 
            '<tr><td>' + v.placa + '</td><td>' + v.tipo + '</td><td>' + capitalize(v.modalidad) + '</td><td>' + (v.destino || 'N/A') + '</td><td>' + formatTime(v.ingreso) + '</td></tr>'
        ).join('');
    }
}

// ===== VEHICULOS DENTRO =====
function renderVehiculosDentro() {
    const tbody = document.getElementById('tabla-vehiculos');
    if (state.vehiculosDentro.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">No hay vehiculos dentro</td></tr>';
        return;
    }
    tbody.innerHTML = state.vehiculosDentro.map(v => {
        const ahora = new Date();
        const minutos = calcularTiempoMinutos(v.ingreso, ahora);
        const cobro = calcularCobro(v, minutos);
        const alertaClass = v.alerta ? ' style="background:rgba(239,68,68,0.1)"' : '';
        return '<tr' + alertaClass + '><td>' + v.placa + '</td><td>' + v.tipo + '</td><td>' + capitalize(v.modalidad) + '</td><td>' + (v.destino || 'N/A') + '</td><td>' + v.facial + '</td><td>' + formatDateTime(v.ingreso) + '</td><td>' + minutosATexto(minutos) + '</td><td>$' + cobro.toLocaleString() + '</td><td><button class="btn-small" onclick="prepararSalida(' + v.id + ')">Salida</button></td></tr>';
    }).join('');
}

// ===== RESIDENTES =====
function renderResidentes() {
    const tbody = document.getElementById('tabla-residentes');
    if (state.residentes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">Sin residentes registrados</td></tr>';
        return;
    }
    tbody.innerHTML = state.residentes.map((r, i) => 
        '<tr><td>' + r.placa + '</td><td>' + r.propietario + '</td><td>' + r.apartamento + '</td><td>' + r.tipo + '</td><td>' + r.documento + '</td><td>' + (r.telefono || '') + '</td><td>' + r.rostro_id + '</td><td><button class="btn-small-edit" onclick="editarResidente(' + i + ')">Editar</button><button class="btn-small" onclick="eliminarResidente(' + i + ')">Eliminar</button></td></tr>'
    ).join('');
}

function onCSVSelect() {
    const file = document.getElementById('csv-file').files[0];
    document.getElementById('csv-filename').textContent = file ? file.name : 'Sin archivos seleccionados';
}

function importarCSV() {
    const file = document.getElementById('csv-file').files[0];
    if (!file) { alert('Seleccione un archivo CSV'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        let importados = 0;
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',');
            const r = {};
            headers.forEach((h, idx) => { r[h] = cols[idx] ? cols[idx].trim() : ''; });
            if (r.placa) {
                const placaUpper = r.placa.toUpperCase();
                const existente = state.residentes.find(res => res.placa.toUpperCase() === placaUpper);
                const nuevo = {
                    placa: placaUpper,
                    propietario: r.propietario || r.nombre || 'Sin nombre',
                    apartamento: r.apartamento || '',
                    tipo: r.tipo || 'carro',
                    documento: r.documento || '',
                    telefono: r.telefono || '',
                    rostro_id: r.rostro_id || ''
                };
                if (existente) {
                    Object.assign(existente, nuevo);
                } else {
                    state.residentes.push(nuevo);
                    importados++;
                }
            }
        }
        renderResidentes();
        alert('Residentes procesados. Nuevos: ' + importados + ', Actualizados: ' + (lines.length - 1 - importados));
    };
    reader.readAsText(file);
}

function reemplazarCSV() {
    if (!confirm('Esto reemplazara TODOS los residentes actuales. El historial de cobros se conserva. Continuar?')) return;
    const file = document.getElementById('csv-file').files[0];
    if (!file) { alert('Seleccione un archivo CSV'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nuevos = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',');
            const r = {};
            headers.forEach((h, idx) => { r[h] = cols[idx] ? cols[idx].trim() : ''; });
            if (r.placa) {
                nuevos.push({
                    placa: r.placa.toUpperCase(),
                    propietario: r.propietario || r.nombre || 'Sin nombre',
                    apartamento: r.apartamento || '',
                    tipo: r.tipo || 'carro',
                    documento: r.documento || '',
                    telefono: r.telefono || '',
                    rostro_id: r.rostro_id || ''
                });
            }
        }
        state.residentes = nuevos;
        renderResidentes();
        alert('Base de residentes reemplazada. ' + nuevos.length + ' residentes cargados. Historial de cobros conservado.');
    };
    reader.readAsText(file);
}

function guardarResidente() {
    const placa = document.getElementById('res-placa').value.trim().toUpperCase();
    const propietario = document.getElementById('res-propietario').value.trim();
    const apartamento = document.getElementById('res-apartamento').value.trim();
    const tipo = document.getElementById('res-tipo').value;
    const documento = document.getElementById('res-documento').value.trim();
    const telefono = document.getElementById('res-telefono').value.trim();
    const rostro_id = document.getElementById('res-rostro').value.trim();

    if (!placa || !propietario || !apartamento) {
        alert('Placa, propietario y apartamento son obligatorios'); return;
    }

    const residente = { placa, propietario, apartamento, tipo, documento, telefono, rostro_id };

    if (state.editingResidente !== null) {
        state.residentes[state.editingResidente] = residente;
        state.editingResidente = null;
        document.getElementById('residente-form-title').textContent = 'Agregar residente manual';
        document.getElementById('btn-guardar-res').textContent = 'Guardar residente';
        document.getElementById('btn-cancelar-res').style.display = 'none';
    } else {
        const existente = state.residentes.find(r => r.placa === placa);
        if (existente) {
            if (confirm('Ya existe un residente con esa placa. Actualizar?')) {
                Object.assign(existente, residente);
            } else { return; }
        } else {
            state.residentes.push(residente);
        }
    }

    renderResidentes();
    limpiarFormResidente();
    alert('Residente guardado correctamente');
}

function editarResidente(index) {
    const r = state.residentes[index];
    document.getElementById('res-placa').value = r.placa;
    document.getElementById('res-propietario').value = r.propietario;
    document.getElementById('res-apartamento').value = r.apartamento;
    document.getElementById('res-tipo').value = r.tipo;
    document.getElementById('res-documento').value = r.documento;
    document.getElementById('res-telefono').value = r.telefono || '';
    document.getElementById('res-rostro').value = r.rostro_id;

    state.editingResidente = index;
    document.getElementById('residente-form-title').textContent = 'Editar residente';
    document.getElementById('btn-guardar-res').textContent = 'Actualizar residente';
    document.getElementById('btn-cancelar-res').style.display = 'inline-block';
}

function cancelarEdicionRes() {
    state.editingResidente = null;
    document.getElementById('residente-form-title').textContent = 'Agregar residente manual';
    document.getElementById('btn-guardar-res').textContent = 'Guardar residente';
    document.getElementById('btn-cancelar-res').style.display = 'none';
    limpiarFormResidente();
}

function limpiarFormResidente() {
    document.getElementById('res-placa').value = '';
    document.getElementById('res-propietario').value = '';
    document.getElementById('res-apartamento').value = '';
    document.getElementById('res-tipo').value = 'carro';
    document.getElementById('res-documento').value = '';
    document.getElementById('res-telefono').value = '';
    document.getElementById('res-rostro').value = '';
}

function eliminarResidente(index) {
    if (!confirm('Eliminar este residente?')) return;
    state.residentes.splice(index, 1);
    renderResidentes();
}

function eliminarTodosResidentes() {
    if (!confirm('Eliminar TODOS los residentes? El historial de cobros se conserva.')) return;
    state.residentes = [];
    renderResidentes();
}

function descargarPlantilla() {
    const csv = 'placa,propietario,apartamento,tipo,documento,telefono,rostro_id\nABC-123,Juan Perez,Torre 1 Apto 101,carro,123456,3001234567,FACE-001\nXYZ-12A,Maria Lopez,Torre 2 Apto 202,moto,654321,3007654321,FACE-002';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_residentes.csv';
    a.click();
}

// ===== CAMARAS =====
function renderCamaras() {
    const tbody = document.getElementById('tabla-camaras');
    tbody.innerHTML = state.camaras.map((c, i) => 
        '<tr><td>' + c.nombre + '</td><td>' + c.tipo + '</td><td>' + c.marca + '</td><td>' + c.url + '</td><td><span class="badge-success">' + c.estado + '</span></td><td><button class="btn-small" onclick="eliminarCamara(' + i + ')">Eliminar</button></td></tr>'
    ).join('');
}
function agregarCamara() {
    const nombre = document.getElementById('cam-nombre').value.trim();
    const tipo = document.getElementById('cam-tipo').value;
    const marca = document.getElementById('cam-marca').value;
    const url = document.getElementById('cam-url').value.trim();
    const usuario = document.getElementById('cam-usuario').value.trim();
    const clave = document.getElementById('cam-clave').value;
    if (!nombre || !url) { alert('Nombre y URL son obligatorios'); return; }
    state.camaras.push({ nombre, tipo, marca, url, usuario, clave, estado: 'Lista' });
    renderCamaras();
    document.getElementById('cam-nombre').value = '';
    document.getElementById('cam-url').value = '';
    alert('Camara agregada');
}
function eliminarCamara(index) {
    state.camaras.splice(index, 1);
    renderCamaras();
}

// ===== TICKET CONFIG =====
function guardarTicketConfig() {
    state.ticketConfig.nombre = document.getElementById('ticket-nombre').value;
    state.ticketConfig.nit = document.getElementById('ticket-nit').value;
    state.ticketConfig.telefono = document.getElementById('ticket-telefono').value;
    state.ticketConfig.direccion = document.getElementById('ticket-direccion').value;
    state.ticketConfig.correo = document.getElementById('ticket-correo').value;
    state.ticketConfig.mensaje = document.getElementById('ticket-mensaje').value;

    document.getElementById('preview-nombre').textContent = state.ticketConfig.nombre;
    document.getElementById('preview-nit').textContent = state.ticketConfig.nit;
    document.getElementById('preview-mensaje').textContent = state.ticketConfig.mensaje;
    alert('Configuracion de ticket guardada');
}
function onLogoSelect() {
    const file = document.getElementById('ticket-logo').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            state.ticketConfig.logo = e.target.result;
            document.getElementById('ticket-logo-preview').innerHTML = '<img src="' + e.target.result + '" alt="Logo">';
        };
        reader.readAsDataURL(file);
    }
}
function imprimirTicketPrueba() {
    const tc = state.ticketConfig;
    const ahora = new Date();
    let contenido = '<div class="ticket-header"><h4>' + tc.nombre + '</h4><p>' + tc.nit + '</p>';
    if (tc.direccion) contenido += '<p>' + tc.direccion + '</p>';
    if (tc.telefono) contenido += '<p>Tel: ' + tc.telefono + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-body"><p><strong>TICKET DE PRUEBA</strong></p>';
    contenido += '<p>Placa: ABC-123</p><p>Tipo: carro</p><p>Modalidad: Visitante</p>';
    contenido += '<p>Apto/Destino: Torre 1 Apto 101</p>';
    contenido += '<p>Ingreso: ' + formatDateTime(ahora) + '</p>';
    contenido += '<p>Salida: ' + formatDateTime(ahora) + '</p>';
    contenido += '<p>Tiempo: 7h 00m</p>';
    contenido += '<p>Tarifa/hora: $' + state.config.tarifaHora.toLocaleString() + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-total"><p><strong>Total a pagar: $6.000</strong></p></div>';
    contenido += '<div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-footer"><p>' + tc.mensaje + '</p></div>';
    mostrarTicket(contenido);
}

// ===== TICKET LISTS (tabs) =====
function showTicketTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('ticket-tab-' + tab).classList.remove('hidden');
}

function renderTicketLists() {
    const ahora = new Date();
    const tbody = document.getElementById('ticket-list-cobros');

    // Filter vehicles that have exceeded their time and have a charge > 0
    const conCobro = state.vehiculosDentro.filter(v => {
        const minutos = calcularTiempoMinutos(v.ingreso, ahora);
        const cobro = calcularCobro(v, minutos);
        return cobro > 0;
    });

    if (conCobro.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Sin vehiculos con cobro pendiente</td></tr>';
        return;
    }

    tbody.innerHTML = conCobro.map(v => {
        const minutos = calcularTiempoMinutos(v.ingreso, ahora);
        const cobro = calcularCobro(v, minutos);

        // Calculate extra time
        let tiempoExtra = 0;
        if (v.modalidad === 'residente') {
            tiempoExtra = Math.max(0, minutos - state.config.tiempoResidentes);
        } else if (v.modalidad === 'visitante') {
            tiempoExtra = Math.max(0, minutos - state.config.tiempoVisitantes);
        } else if (v.modalidad === 'airbnb' && v.airbnb) {
            const salidaAut = new Date(v.airbnb.salidaAutorizada);
            if (ahora > salidaAut) {
                tiempoExtra = Math.floor((ahora - salidaAut) / (1000 * 60));
            }
        }

        return '<tr><td>' + v.placa + '</td><td>' + v.tipo + '</td><td>' + capitalize(v.modalidad) + '</td><td>' + (v.destino || 'N/A') + '</td><td>' + minutosATexto(tiempoExtra) + '</td><td style="color:#ef4444;font-weight:600;">$' + cobro.toLocaleString() + '</td><td><button class="btn-small-edit" onclick="prepararSalida(' + v.id + ')">Generar ticket cobro</button></td></tr>';
    }).join('');
}
// ===== HISTORIAL =====
function renderHistorial() {
    const tbody = document.getElementById('tabla-historial');
    const filtroFecha = document.getElementById('filtro-fecha').value;
    const filtroMod = document.getElementById('filtro-modalidad').value;
    const search = document.getElementById('historial-search').value.trim().toLowerCase();

    let filtrado = state.historial;
    if (filtroFecha) {
        const fDate = new Date(filtroFecha).toLocaleDateString('es-CO');
        filtrado = filtrado.filter(h => formatDate(h.ingreso) === fDate || formatDate(h.salida) === fDate);
    }
    if (filtroMod) {
        filtrado = filtrado.filter(h => h.modalidad === filtroMod);
    }
    if (search) {
        filtrado = filtrado.filter(h => 
            h.placa.toLowerCase().includes(search) ||
            h.conductor.toLowerCase().includes(search) ||
            (h.destino && h.destino.toLowerCase().includes(search))
        );
    }

    if (filtrado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty">Sin registros en el historial</td></tr>';
        return;
    }
    tbody.innerHTML = filtrado.map((h, idx) => {
        const alertaText = h.alerta ? '<span class="badge-warning">Alerta activa</span>' : '<span class="badge-success">OK</span>';
        return '<tr><td>' + h.placa + '</td><td>' + h.tipo + '</td><td>' + capitalize(h.modalidad) + '</td><td>' + h.conductor + '</td><td>' + (h.destino || 'N/A') + '</td><td>' + formatDateTime(h.ingreso) + '</td><td>' + formatDateTime(h.salida) + '</td><td>' + minutosATexto(h.minutos) + '</td><td>$' + h.cobro.toLocaleString() + '</td><td>' + alertaText + '</td><td><button class="btn-small-edit" onclick="generarTicketDesdeHistorial(' + idx + ')">Generar ticket</button></td></tr>';
    }).join('');
}

function generarTicketDesdeHistorial(index) {
    const h = state.historial[index];
    if (!h) return;
    const tc = state.ticketConfig;
    let contenido = '<div class="ticket-header"><h4>' + tc.nombre + '</h4><p>' + tc.nit + '</p>';
    if (tc.direccion) contenido += '<p>' + tc.direccion + '</p>';
    if (tc.telefono) contenido += '<p>Tel: ' + tc.telefono + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-body"><p><strong>TICKET DE COBRO - HISTORIAL</strong></p>';
    contenido += '<p>Placa: ' + h.placa + '</p>';
    contenido += '<p>Tipo: ' + h.tipo + '</p>';
    contenido += '<p>Modalidad: ' + capitalize(h.modalidad) + '</p>';
    contenido += '<p>Apto/Destino: ' + (h.destino || 'N/A') + '</p>';
    contenido += '<p>Ingreso: ' + formatDateTime(h.ingreso) + '</p>';
    contenido += '<p>Salida: ' + formatDateTime(h.salida) + '</p>';
    contenido += '<p>Tiempo: ' + minutosATexto(h.minutos) + '</p>';
    contenido += '<p>Tarifa/hora: $' + state.config.tarifaHora.toLocaleString() + '</p>';
    contenido += '</div><div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-total"><p><strong>Total a pagar: $' + h.cobro.toLocaleString() + '</strong></p></div>';
    contenido += '<div class="ticket-divider">------------------------------</div>';
    contenido += '<div class="ticket-footer"><p>' + tc.mensaje + '</p></div>';
    mostrarTicket(contenido);
}

function filtrarHistorial() {
    renderHistorial();
}
function exportarHistorial() {
    let csv = 'placa,tipo,modalidad,conductor,destino,ingreso,salida,tiempo_minutos,cobro,alerta\n';
    state.historial.forEach(h => {
        csv += h.placa + ',' + h.tipo + ',' + h.modalidad + ',' + h.conductor + ',' + (h.destino || '') + ',' + formatDateTime(h.ingreso) + ',' + formatDateTime(h.salida) + ',' + h.minutos + ',' + h.cobro + ',' + (h.alerta ? 'SI' : 'NO') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historial_parqueadero_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
}

// ===== ALERTAS =====
function startAlertTimer() {
    setInterval(checkAlerts, 60000);
}
function checkAlerts() {
    const ahora = new Date();
    state.vehiculosDentro.forEach(v => {
        let shouldAlert = false;
        let mensaje = '';
        let minutosTranscurridos = 0;
        let minutosLimite = 0;

        if (v.modalidad === 'visitante') {
            minutosTranscurridos = calcularTiempoMinutos(v.ingreso, ahora);
            minutosLimite = state.config.tiempoVisitantes;
            // Solo alertar si hay tiempo configurado (> 0) y se paso
            if (minutosLimite > 0 && minutosTranscurridos > minutosLimite) {
                shouldAlert = true;
                const minutosExtra = minutosTranscurridos - minutosLimite;
                mensaje = 'VISITANTE ' + v.placa + ' supero tiempo autorizado (' + minutosATexto(minutosLimite) + '). Extra: ' + minutosATexto(minutosExtra) + ' | Tiempo total: ' + minutosATexto(minutosTranscurridos);
            }
        } else if (v.modalidad === 'residente') {
            minutosTranscurridos = calcularTiempoMinutos(v.ingreso, ahora);
            minutosLimite = state.config.tiempoResidentes;
            // Solo alertar si hay tiempo configurado (> 0) y se paso
            if (minutosLimite > 0 && minutosTranscurridos > minutosLimite) {
                shouldAlert = true;
                const minutosExtra = minutosTranscurridos - minutosLimite;
                mensaje = 'RESIDENTE ' + v.placa + ' supero tiempo autorizado (' + minutosATexto(minutosLimite) + '). Extra: ' + minutosATexto(minutosExtra) + ' | Tiempo total: ' + minutosATexto(minutosTranscurridos);
            }
        } else if (v.modalidad === 'airbnb' && v.airbnb) {
            const salidaAut = new Date(v.airbnb.salidaAutorizada);
            if (ahora > salidaAut) {
                shouldAlert = true;
                const minutosExtra = Math.floor((ahora - salidaAut) / (1000 * 60));
                mensaje = 'AIRBNB ' + v.placa + ' supero hora de salida (' + formatDateTime(salidaAut) + '). Extra: ' + minutosATexto(minutosExtra);
            }
        }

        if (shouldAlert) {
            const cobroActual = calcularCobro(v, minutosTranscurridos || calcularTiempoMinutos(v.ingreso, ahora));

            // Buscar si ya existe una alerta para este vehiculo
            const alertaExistente = state.alertas.find(a => a.vehiculoId === v.id && !a.vista);

            if (alertaExistente) {
                // Actualizar alerta existente con datos actuales
                alertaExistente.mensaje = mensaje;
                alertaExistente.fecha = ahora;
                alertaExistente.cobro = cobroActual;
            } else {
                // Crear nueva alerta
                v.alerta = true;
                state.alertas.push({
                    id: Date.now() + Math.random(),
                    vehiculoId: v.id,
                    placa: v.placa,
                    modalidad: v.modalidad,
                    mensaje: mensaje,
                    fecha: ahora,
                    tipo: 'warning',
                    vista: false,
                    cobro: cobroActual
                });
            }
            updateDashboard();
            renderVehiculosDentro();
        }
    });
}
function renderAlertas() {
    const container = document.getElementById('lista-alertas');
    const filtroDesde = document.getElementById('alerta-fecha-desde').value;
    const filtroHasta = document.getElementById('alerta-fecha-hasta').value;
    const filtroEstado = document.getElementById('alerta-estado').value;
    const filtroMod = document.getElementById('alerta-modalidad').value;

    let filtrado = state.alertas;

    if (filtroDesde) {
        const desde = new Date(filtroDesde);
        filtrado = filtrado.filter(a => new Date(a.fecha) >= desde);
    }
    if (filtroHasta) {
        const hasta = new Date(filtroHasta);
        hasta.setHours(23, 59, 59);
        filtrado = filtrado.filter(a => new Date(a.fecha) <= hasta);
    }
    if (filtroEstado === 'activas') {
        filtrado = filtrado.filter(a => !a.vista);
    } else if (filtroEstado === 'vistas') {
        filtrado = filtrado.filter(a => a.vista);
    }
    if (filtroMod) {
        filtrado = filtrado.filter(a => a.modalidad === filtroMod);
    }

    if (filtrado.length === 0) {
        container.innerHTML = '<p class="empty">Sin alertas registradas</p>';
        return;
    }
    container.innerHTML = filtrado.slice().reverse().map(a => {
        const clase = a.vista ? 'seen' : '';
        const modalidadBadge = a.modalidad ? '<span class="badge-success" style="margin-right:8px;">' + capitalize(a.modalidad) + '</span>' : '';
        return '<div class="alert-item ' + a.tipo + ' ' + clase + '"><div style="flex:1">' + modalidadBadge + '<span class="alert-text">' + a.mensaje + '</span><br><span class="alert-time">' + formatDateTime(a.fecha) + '</span><br><span style="font-size:12px;color:#94a3b8">Cobro estimado: $' + (a.cobro || 0).toLocaleString() + '</span></div><div class="alert-actions">' + (a.vista ? '' : '<button class="btn-alert-ticket" onclick="generarTicketAlerta(' + a.id + ')">Generar ticket</button>') + '<button class="btn-alert-historial" onclick="moverAlertaAHistorial(' + a.id + ')">A historial</button></div></div>';
    }).join('');
}
function filtrarAlertas() {
    renderAlertas();
}
function generarTicketAlerta(alertaId) {
    const alerta = state.alertas.find(a => a.id === alertaId);
    if (!alerta) return;
    const vehiculo = state.vehiculosDentro.find(v => v.id === alerta.vehiculoId);
    if (!vehiculo) {
        alert('El vehiculo ya no esta en el parqueadero');
        return;
    }

    const ahora = new Date();
    const minutos = calcularTiempoMinutos(vehiculo.ingreso, ahora);
    const cobro = calcularCobro(vehiculo, minutos);

    // 1. Generar ticket de cobro
    generarTicketSalida(vehiculo, cobro, minutos);

    // 2. Mover a historial
    const registro = {
        id: vehiculo.id,
        placa: vehiculo.placa,
        tipo: vehiculo.tipo,
        modalidad: vehiculo.modalidad,
        conductor: vehiculo.conductor,
        destino: vehiculo.destino,
        ingreso: vehiculo.ingreso,
        salida: ahora,
        minutos: minutos,
        tiempoHoras: minutos / 60,
        cobro: cobro,
        alerta: true,
        alertaVista: true
    };
    state.historial.unshift(registro);

    // 3. Eliminar de vehiculos dentro
    state.vehiculosDentro = state.vehiculosDentro.filter(v => v.id !== vehiculo.id);

    // 4. Eliminar alerta
    state.alertas = state.alertas.filter(a => a.id !== alertaId);

    // 5. Actualizar todo
    updateDashboard();
    renderVehiculosDentro();
    renderHistorial();
    renderAlertas();
    renderTicketLists();
}
function moverAlertaAHistorial(alertaId) {
    const alerta = state.alertas.find(a => a.id === alertaId);
    if (!alerta) return;
    const vehiculo = state.vehiculosDentro.find(v => v.id === alerta.vehiculoId);
    if (!vehiculo) {
        alert('El vehiculo ya no esta en el parqueadero');
        return;
    }

    const ahora = new Date();
    const minutos = calcularTiempoMinutos(vehiculo.ingreso, ahora);
    const cobro = calcularCobro(vehiculo, minutos);

    const registro = {
        id: vehiculo.id,
        placa: vehiculo.placa,
        tipo: vehiculo.tipo,
        modalidad: vehiculo.modalidad,
        conductor: vehiculo.conductor,
        destino: vehiculo.destino,
        ingreso: vehiculo.ingreso,
        salida: ahora,
        minutos: minutos,
        tiempoHoras: minutos / 60,
        cobro: cobro,
        alerta: true,
        alertaVista: true
    };
    state.historial.unshift(registro);

    state.vehiculosDentro = state.vehiculosDentro.filter(v => v.id !== vehiculo.id);
    state.alertas = state.alertas.filter(a => a.id !== alertaId);

    updateDashboard();
    renderVehiculosDentro();
    renderHistorial();
    renderAlertas();
    alert('Vehiculo movido a historial. Puede generar el ticket desde el historial.');
}
function exportarAlertas() {
    let csv = 'fecha,placa,modalidad,mensaje,cobro_estimado,estado\n';
    state.alertas.forEach(a => {
        const v = state.vehiculosDentro.find(ve => ve.id === a.vehiculoId);
        const modalidad = v ? v.modalidad : 'desconocido';
        csv += formatDateTime(a.fecha) + ',' + a.placa + ',' + modalidad + ',' + a.mensaje + ',' + (a.cobro || 0) + ',' + (a.vista ? 'Vista' : 'Activa') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alertas_parqueadero_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
}
function limpiarAlertas() {
    state.alertas.forEach(a => a.vista = true);
    state.vehiculosDentro.forEach(v => v.alertaVista = true);
    updateDashboard();
    renderAlertas();
}

// ===== CONFIG =====
function cargarConfigForm() {
    document.getElementById('config-carros').value = state.config.cuposCarros;
    document.getElementById('config-motos').value = state.config.cuposMotos;
    document.getElementById('config-tarifa').value = state.config.tarifaHora;
    document.getElementById('config-alerta').value = state.config.alertaNoReg;
    document.getElementById('config-usuario').value = state.config.usuario;
    document.getElementById('config-clave').value = '';

    const resMin = state.config.tiempoResidentes;
    document.getElementById('config-res-dias').value = Math.floor(resMin / 1440);
    document.getElementById('config-res-horas').value = Math.floor((resMin % 1440) / 60);
    document.getElementById('config-res-minutos').value = resMin % 60;

    const visMin = state.config.tiempoVisitantes;
    document.getElementById('config-vis-dias').value = Math.floor(visMin / 1440);
    document.getElementById('config-vis-horas').value = Math.floor((visMin % 1440) / 60);
    document.getElementById('config-vis-minutos').value = visMin % 60;

    const airMin = state.config.tiempoAirbnb;
    document.getElementById('config-air-dias').value = Math.floor(airMin / 1440);
    document.getElementById('config-air-horas').value = Math.floor((airMin % 1440) / 60);
    document.getElementById('config-air-minutos').value = airMin % 60;
}

function guardarConfig() {
    state.config.cuposCarros = parseInt(document.getElementById('config-carros').value) || 150;
    state.config.cuposMotos = parseInt(document.getElementById('config-motos').value) || 300;
    state.config.tarifaHora = parseInt(document.getElementById('config-tarifa').value) || 3000;
    state.config.alertaNoReg = parseInt(document.getElementById('config-alerta').value) || 300;
    state.config.usuario = document.getElementById('config-usuario').value || 'admin';
    const nuevaClave = document.getElementById('config-clave').value;
    if (nuevaClave) state.config.clave = nuevaClave;

    state.config.tiempoResidentes = textoAMinutos(
        document.getElementById('config-res-dias').value,
        document.getElementById('config-res-horas').value,
        document.getElementById('config-res-minutos').value
    );
    state.config.tiempoVisitantes = textoAMinutos(
        document.getElementById('config-vis-dias').value,
        document.getElementById('config-vis-horas').value,
        document.getElementById('config-vis-minutos').value
    );
    state.config.tiempoAirbnb = textoAMinutos(
        document.getElementById('config-air-dias').value,
        document.getElementById('config-air-horas').value,
        document.getElementById('config-air-minutos').value
    );

    document.getElementById('stat-carros-aut').textContent = state.config.cuposCarros;
    document.getElementById('stat-motos-aut').textContent = state.config.cuposMotos;
    alert('Configuracion guardada correctamente');
}

// ===== PANTALLA DE DISPONIBILIDAD =====
function renderDisponibilidad() {
    const carrosDentro = state.vehiculosDentro.filter(v => v.tipo === 'carro').length;
    const motosDentro = state.vehiculosDentro.filter(v => v.tipo === 'moto').length;
    const carrosDisp = state.config.cuposCarros - carrosDentro;
    const motosDisp = state.config.cuposMotos - motosDentro;
    const carrosOcup = ((carrosDentro / state.config.cuposCarros) * 100).toFixed(1);
    const motosOcup = ((motosDentro / state.config.cuposMotos) * 100).toFixed(1);

    document.getElementById('disp-carros-disp').textContent = carrosDisp;
    document.getElementById('disp-carros-total').textContent = state.config.cuposCarros;
    document.getElementById('disp-carros-ocup').textContent = carrosOcup + '%';
    document.getElementById('disp-carros-bar').style.width = carrosOcup + '%';

    document.getElementById('disp-motos-disp').textContent = motosDisp;
    document.getElementById('disp-motos-total').textContent = state.config.cuposMotos;
    document.getElementById('disp-motos-ocup').textContent = motosOcup + '%';
    document.getElementById('disp-motos-bar').style.width = motosOcup + '%';

    // Color segun ocupacion
    const carrosBar = document.getElementById('disp-carros-bar');
    if (carrosOcup > 90) carrosBar.style.background = '#ef4444';
    else if (carrosOcup > 70) carrosBar.style.background = '#f59e0b';
    else carrosBar.style.background = '#00ff88';

    const motosBar = document.getElementById('disp-motos-bar');
    if (motosOcup > 90) motosBar.style.background = '#ef4444';
    else if (motosOcup > 70) motosBar.style.background = '#f59e0b';
    else motosBar.style.background = '#00ff88';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('login-pass').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') doLogin();
    });
});
