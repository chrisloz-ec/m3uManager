// utils.js - Funciones de utilidad comunes


// ===== FUNCIONES DEL USUARIO =====

/**
 * Actualiza la información del usuario en la interfaz
 * @param {Object} user - Objeto de usuario de Supabase
 */
function updateUserInfo(user) {
    const userNameElement = document.getElementById('userName');
    if (userNameElement && user) {
        userNameElement.textContent = user.user_metadata?.full_name || user.email;
    }
    
    // También actualizar en elementos con clase user-name (por compatibilidad)
    document.querySelectorAll('.user-name').forEach(element => {
        element.textContent = user.user_metadata?.full_name || user.email;
    });
}

/**
 * Actualiza la información del plan del usuario
 * @param {string} userId - ID del usuario
 */
async function updatePlanInfo(userId) {
    if (!userId) return;
    
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        
        // Obtener perfil del usuario
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('subscription_tier, lists_limit')
            .eq('id', userId)
            .single();
        
        if (profileError) {
            console.warn('No se pudo cargar información del plan:', profileError);
            return;
        }
        
        // Obtener conteo de listas
        const { count: listCount, error: countError } = await supabase
            .from('lists')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        
        if (countError) {
            console.warn('Error contando listas:', countError);
            return;
        }
        
        // Actualizar elementos en la interfaz
        updatePlanElements(profile, listCount || 0);
        
    } catch (error) {
        console.error('Error actualizando información del plan:', error);
    }
}

/**
 * Actualiza los elementos HTML con la información del plan
 * @param {Object} profile - Perfil del usuario
 * @param {number} listCount - Número de listas del usuario
 */
function updatePlanElements(profile, listCount) {
    // Badge del plan
    const planBadge = document.getElementById('planBadge');
    if (planBadge) {
        planBadge.textContent = profile.subscription_tier === 'free' ? 'Gratuito' : 'Premium';
        planBadge.className = `badge ${profile.subscription_tier === 'free' ? 'bg-warning text-dark' : 'bg-success'}`;
    }
    
    // Progreso de listas
    const listProgress = document.getElementById('listProgress');
    const listUsage = document.getElementById('listUsage');
    
    if (listProgress && listUsage && profile.lists_limit) {
        const percentage = (listCount / profile.lists_limit) * 100;
        listProgress.style.width = `${Math.min(percentage, 100)}%`;
        listUsage.textContent = `${listCount} de ${profile.lists_limit} listas utilizadas`;
    }
    
    // Estadísticas del plan
    const planStats = document.getElementById('planStats');
    if (planStats) {
        planStats.innerHTML = `
            <div class="row">
                <div class="col-6">
                    <small class="text-muted">Plan</small>
                    <div class="fw-bold">${profile.subscription_tier === 'free' ? 'Gratuito' : 'Premium'}</div>
                </div>
                <div class="col-6">
                    <small class="text-muted">Límite listas</small>
                    <div class="fw-bold">${profile.lists_limit}</div>
                </div>
            </div>
        `;
    }
}

// ===== FUNCIONES DE ALERTA Y NOTIFICACIÓN =====

/**
 * Muestra una alerta en la interfaz
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de alerta (success, danger, warning, info)
 * @param {number} duration - Duración en milisegundos (opcional, default: 5000)
 * @returns {HTMLElement} Elemento de alerta creado
 */
function showAlert(message, type = 'info', duration = 5000) {
    console.log('showAlert:', { message, type });
    
    // Crear o obtener contenedor de alertas
    let alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alert-container';
        alertContainer.className = 'position-fixed top-0 end-0 p-3';
        alertContainer.style.zIndex = '9999';
        alertContainer.style.maxWidth = '400px';
        document.body.appendChild(alertContainer);
    }
    
    // Crear ID único para la alerta
    const alertId = 'alert-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Definir iconos según tipo
    const icons = {
        success: 'check-circle-fill',
        danger: 'exclamation-triangle-fill',
        warning: 'exclamation-circle-fill',
        info: 'info-circle-fill'
    };
    
    // Crear elemento de alerta
    const alertDiv = document.createElement('div');
    alertDiv.id = alertId;
    alertDiv.className = `alert alert-${type} alert-dismissible fade show shadow-sm`;
    alertDiv.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-${icons[type] || 'info-circle'} me-2"></i>
            <div class="flex-grow-1">${message}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Añadir a contenedor
    alertContainer.appendChild(alertDiv);
    
    // Auto-remover después de la duración especificada
    setTimeout(() => {
        const alertElement = document.getElementById(alertId);
        if (alertElement) {
            // Animación de salida
            alertElement.classList.remove('show');
            setTimeout(() => {
                if (alertElement.parentElement) {
                    alertElement.remove();
                }
            }, 150);
        }
    }, duration);
    
    return alertDiv;
}

/**
 * Muestra un toast de notificación
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de toast (success, danger, warning, info)
 * @param {string} title - Título del toast (opcional)
 */
function showToast(message, type = 'info', title = '') {
    // Crear contenedor de toasts si no existe
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }
    
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${title ? `<strong>${title}</strong><br>` : ''}
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
}

// ===== FUNCIONES DE FORMATEO =====

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, function(m) { 
        return map[m]; 
    });
}

/**
 * Formatea el tamaño de archivo en unidades legibles
 * @param {number} bytes - Tamaño en bytes
 * @returns {string} Tamaño formateado
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formatea la fecha a un formato relativo (hace X tiempo)
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Tiempo formateado
 */
function formatTimeAgo(date) {
    if (!date) return '';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now - dateObj;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
    
    // Si es más de una semana, mostrar fecha completa
    return dateObj.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Formatea una fecha a string local
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha formateada
 */
function formatDate(date) {
    if (!date) return '';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ===== FUNCIONES DE VALIDACIÓN =====

/**
 * Valida si una URL es válida
 * @param {string} url - URL a validar
 * @returns {boolean} true si es válida
 */
function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
        new URL(url);
        return true;
    } catch (error) {
        // También aceptar URLs relativas para streams
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('rtmp://') || 
            url.startsWith('rtsp://') || url.startsWith('udp://')) {
            return true;
        }
        return false;
    }
}

/**
 * Valida si un email es válido
 * @param {string} email - Email a validar
 * @returns {boolean} true si es válido
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ===== FUNCIONES DE DOM =====

/**
 * Crea un elemento HTML de forma segura
 * @param {string} tag - Etiqueta HTML
 * @param {Object} attributes - Atributos del elemento
 * @param {string|HTMLElement} content - Contenido del elemento
 * @returns {HTMLElement} Elemento creado
 */
function createElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    // Añadir atributos
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'htmlFor') {
            element.htmlFor = value;
        } else if (key.startsWith('on')) {
            element[key] = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Añadir contenido
    if (typeof content === 'string') {
        element.innerHTML = escapeHtml(content);
    } else if (content instanceof HTMLElement) {
        element.appendChild(content);
    }
    
    return element;
}

/**
 * Alterna la visibilidad de un elemento
 * @param {string} elementId - ID del elemento
 * @param {boolean} show - true para mostrar, false para ocultar
 */
function toggleElement(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
        if (show) {
            element.classList.remove('d-none');
        } else {
            element.classList.add('d-none');
        }
    }
}

/**
 * Actualiza el contenido de un elemento
 * @param {string} elementId - ID del elemento
 * @param {string} content - Contenido a mostrar
 */
function updateElementContent(elementId, content) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = content;
    }
}

// ===== FUNCIONES DE M3U =====

/**
 * Parsea contenido M3U básico
 * @param {string} content - Contenido M3U
 * @returns {Array} Array de canales
 */
function parseM3UContent(content) {
    const channels = [];
    const lines = content.split('\n');
    let currentChannel = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            currentChannel = parseExtInfLine(line);
        } else if (line && !line.startsWith('#') && currentChannel) {
            currentChannel.stream_url = line;
            channels.push(currentChannel);
            currentChannel = null;
        }
    }
    
    return channels;
}

/**
 * Parsea una línea EXTINF de M3U
 * @param {string} line - Línea EXTINF
 * @returns {Object} Información del canal
 */
function parseExtInfLine(line) {
    const channel = {
        name: '',
        tvg_name: '',
        logo_url: '',
        category: '',
        stream_url: '',
        status: 'unknown'
    };
    
    // Extraer atributos
    const attrsMatch = line.match(/tvg-id="([^"]*)"|tvg-name="([^"]*)"|tvg-logo="([^"]*)"|group-title="([^"]*)"/g);
    if (attrsMatch) {
        attrsMatch.forEach(attr => {
            const [key, value] = attr.split('=');
            const cleanValue = value.replace(/"/g, '');
            
            switch(key) {
                case 'tvg-id':
                    channel.tvg_name = cleanValue;
                    break;
                case 'tvg-name':
                    channel.name = cleanValue || channel.name;
                    break;
                case 'tvg-logo':
                    channel.logo_url = cleanValue;
                    break;
                case 'group-title':
                    channel.category = cleanValue;
                    break;
            }
        });
    }
    
    // Extraer nombre del canal (después de la última coma)
    const nameMatch = line.match(/,(.*)$/);
    if (nameMatch && !channel.name) {
        channel.name = nameMatch[1].trim();
    }
    
    return channel;
}

// ===== EXPORTACIÓN DE FUNCIONES =====

// Exportar como objeto global para compatibilidad
window.Utils = {
    // Supabase
    getSupabaseClient,
    
    // Usuario
    updateUserInfo,
    updatePlanInfo,
    
    // Alertas
    showAlert,
    showToast,
    
    // Formateo
    escapeHtml,
    formatFileSize,
    formatTimeAgo,
    formatDate,
    
    // Validación
    isValidUrl,
    isValidEmail,
    
    // DOM
    createElement,
    toggleElement,
    updateElementContent,
    
    // M3U
    parseM3UContent,
    parseExtInfLine
};

// También exportar funciones globalmente para compatibilidad con código existente
window.getSupabaseClient = getSupabaseClient;
window.updateUserInfo = updateUserInfo;
window.updatePlanInfo = updatePlanInfo;
window.showAlert = showAlert;
window.escapeHtml = escapeHtml;
window.formatFileSize = formatFileSize;
window.formatTimeAgo = formatTimeAgo;