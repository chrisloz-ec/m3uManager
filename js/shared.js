class SharedListManager {
    constructor() {
        this.supabaseUrl = 'https://twbhuuhbfqvwsiavtffy.supabase.co';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3Ymh1dWhiZnF2d3NpYXZ0ZmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDU5NzIsImV4cCI6MjA4MDM4MTk3Mn0.ElQX9v4GfG0P-RUVNbuXBokJgsmixkI7EuAOasRWB0w';
        this.client = null;
        this.shareToken = null;
        this.listData = null;
        this.channels = [];
        
        this.init();
    }
    
    async init() {
        // Obtener token de la URL
        this.shareToken = this.getTokenFromURL();
        if (!this.shareToken) {
            this.showError('Token no válido o no proporcionado');
            return;
        }
        
        // Inicializar Supabase
        this.client = supabase.createClient(this.supabaseUrl, this.supabaseKey);
        
        // Cargar lista compartida
        await this.loadSharedList();
    }
    
    getTokenFromURL() {
        let token = null;
        
        // Método 1: De parámetro ?token=
        const urlParams = new URLSearchParams(window.location.search);
        token = urlParams.get('token');
        
        if (!token) {
            // Método 2: De la ruta /shared/token
            const path = window.location.pathname;
            const parts = path.split('/');
            
            // Buscar 'shared' en la ruta
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] === 'shared' && i + 1 < parts.length) {
                    token = parts[i + 1];
                    break;
                }
            }
        }
        
        // Decodificar y limpiar
        if (token) {
            token = decodeURIComponent(token);
            
            // Limpiar caracteres problemáticos
            token = token
                .replace(/\//g, '')  // Quitar /
                .replace(/\?/g, '')  // Quitar ?
                .replace(/&/g, '')   // Quitar &
                .replace(/=/g, '');  // Quitar =
        }
        
        console.log('Token extraído y limpiado:', token);
        return token;
    }
    
    async loadSharedList() {
        try {
            console.log('Token a buscar:', this.shareToken);
            
            // 1. Buscar lista por token
            const { data: list, error: listError } = await this.client
                .from('lists')
                .select('*')
                .eq('share_token', this.shareToken)
                .eq('is_public', true)
                .single();
            
            if (listError) {
                console.error('Error Supabase:', listError);
                if (listError.code === 'PGRST116') {
                    this.showError('El enlace no es válido o ha expirado');
                } 
                else if (listError.message && listError.message.includes('Failed to fetch')) {
                    this.showError('Error de conexión. Verifica tu internet.');
                }
                else if (listError.message && listError.message.includes('406')) {
                    // Intentar otra consulta sin el último carácter
                    const cleanToken = this.shareToken;
                    console.log('Intentando con token limpio:', cleanToken);
                    
                    const { data: list2, error: listError2 } = await this.client
                        .from('lists')
                        .select('*')
                        .eq('share_token', cleanToken)
                        .eq('is_public', true)
                        .single();
                        
                    if (listError2) {
                        this.showError('Error 406: Token inválido. Pide un nuevo enlace.');
                    } else {
                        this.listData = list2;
                        await this.loadChannels();
                    }
                    return;
                }
                else {
                    this.showError('Error: ' + (listError.message || 'Desconocido'));
                }
                return;
            }
            
            if (!list) {
                this.showError('Lista no encontrada');
                return;
            }
            
            this.listData = list;
            console.log('Lista encontrada:', list);
            
            // 2. Obtener canales de esta lista
            await this.loadChannels();
            
        } catch (error) {
            console.error('Error cargando lista:', error);
            this.showError('Error al cargar la lista: ' + error.message);
        }
    }
    
    async loadChannels() {
        try {
            // Obtener canales usando la relación directa list_id
            const { data: channels, error: channelsError } = await this.client
                .from('channels')
                .select(`
                    *,
                    categories (
                        name
                    )
                `)
                .eq('list_id', this.listData.id)
                .eq('status', 'active')  // Solo canales activos
                .order('name');
            
            if (channelsError) throw channelsError;
            
            // Procesar canales (CORREGIDO: No hay nested object)
            this.channels = channels.map(channel => ({
                id: channel.id,
                name: channel.name,
                tvg_name: channel.tvg_name,
                logo_url: channel.logo_url,
                stream_url: channel.stream_url,
                category: channel.categories?.name || 'General'
            }));
            
            console.log('Canales cargados:', this.channels.length);
            
            // 3. Mostrar datos
            this.displayList();
            
        } catch (error) {
            console.error('Error cargando canales:', error);
            this.showError('Error al cargar los canales: ' + error.message);
        }
    }
    
    displayList() {
        // Ocultar cargador
        document.getElementById('loading').classList.add('d-none');
        
        // Mostrar título
        const titleElement = document.getElementById('listTitle');
        if (titleElement) {
            titleElement.textContent = this.listData.name || 'Lista Compartida';
        }
        
        // Mostrar tabla de canales
        const tableBody = document.getElementById('channelsTable');
        if (tableBody) {
            tableBody.innerHTML = '';
            
            this.channels.forEach(channel => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="align-middle">
                        ${channel.logo_url ? 
                            `<img src="${channel.logo_url}" alt="${channel.name}" class="img-thumbnail" style="max-height: 40px; max-width: 60px;">` : 
                            '<i class="bi bi-tv text-muted fs-5"></i>'}
                    </td>
                    <td class="align-middle">
                        <strong>${this.escapeHtml(channel.name)}</strong>
                        ${channel.tvg_name ? `<br><small class="text-muted">${this.escapeHtml(channel.tvg_name)}</small>` : ''}
                    </td>
                    <td class="align-middle">
                        <span class="badge bg-secondary">${this.escapeHtml(channel.category)}</span>
                    </td>
                    <td class="align-middle">
                        <div class="d-flex align-items-center">
                            <input type="text" 
                                   class="form-control form-control-sm me-2" 
                                   value="${this.escapeHtml(channel.stream_url)}" 
                                   readonly
                                   style="font-size: 0.8em;">
                            <button class="btn btn-sm btn-outline-secondary copy-url-btn" 
                                    data-url="${this.escapeHtml(channel.stream_url)}"
                                    title="Copiar URL">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(row);
            });
            
            // Agregar event listeners para botones de copiar URL
            document.querySelectorAll('.copy-url-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    const url = e.target.closest('button').getAttribute('data-url');
                    this.copyToClipboard(url);
                });
            });
        }
        
        // Mostrar contenido
        const contentElement = document.getElementById('content');
        if (contentElement) {
            contentElement.classList.remove('d-none');
        }
        
        // Configurar botones de exportación
        this.setupExportButtons();
        
        // Mostrar estadísticas
        this.showStats();
    }
    
    showStats() {
        const statsElement = document.getElementById('stats');
        if (!statsElement) {
            // Crear elemento si no existe
            const contentElement = document.getElementById('content');
            if (contentElement) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'stats';
                statsDiv.className = 'mt-3';
                contentElement.appendChild(statsDiv);
            }
        }
        
        const statsDiv = document.getElementById('stats');
        if (statsDiv) {
            const updatedDate = this.listData.updated_at ? 
                new Date(this.listData.updated_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }) : 'Fecha desconocida';
            
            statsDiv.innerHTML = `
                <div class="card border-primary">
                    <div class="card-body">
                        <p class="text-muted mb-0">
                            <i class="bi bi-info-circle me-1"></i>
                            Esta lista fue compartida por otro usuario. Los enlaces pueden expirar.
                        </p>
                        La lista contiene <strong class="text-primary">${this.channels.length}</strong> canales${this.listData.name ? ` de <span class="text-primary"> "${this.listData.name}"` : ''}</span>.
                        <small>Compartida el ${updatedDate}.</small>
                    </div>
                </div>
            `;
        }
    }
    
    setupExportButtons() {
        // Botón M3U
        const exportM3UBtn = document.getElementById('exportM3U');
        if (exportM3UBtn) {
            exportM3UBtn.addEventListener('click', () => {
                this.exportToM3U();
            });
        }
        
        // Botón JSON
        const exportJSONBtn = document.getElementById('exportJSON');
        if (exportJSONBtn) {
            exportJSONBtn.addEventListener('click', () => {
                this.exportToJSON();
            });
        }
    }
    
    exportToM3U() {
        try {
            if (this.channels.length === 0) {
                this.showAlert('No hay canales para exportar', 'warning');
                return;
            }
            
            let m3uContent = '#EXTM3U\n';
            
            this.channels.forEach(channel => {
                m3uContent += `#EXTINF:-1 tvg-id="${channel.tvg_name || ''}" `;
                m3uContent += `tvg-name="${this.escapeHtml(channel.name)}" `;
                m3uContent += `tvg-logo="${channel.logo_url || ''}" `;
                m3uContent += `group-title="${this.escapeHtml(channel.category)}",`;
                m3uContent += `${this.escapeHtml(channel.name)}\n`;
                m3uContent += `${channel.stream_url}\n\n`;
            });

            const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lista-${this.listData.name ? this.sanitizeFilename(this.listData.name) : 'compartida'}-${this.shareToken}.m3u`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showAlert(`Archivo M3U descargado (${this.channels.length} canales)`, 'success');
        } catch (error) {
            console.error('Error exportando M3U:', error);
            this.showAlert('Error al exportar: ' + error.message, 'danger');
        }
    }
    
    exportToJSON() {
        try {
            if (this.channels.length === 0) {
                this.showAlert('No hay canales para exportar', 'warning');
                return;
            }
            
            const exportData = {
                list: {
                    id: this.listData.id,
                    name: this.listData.name,
                    share_token: this.listData.share_token,
                    created_at: this.listData.created_at,
                    updated_at: this.listData.updated_at
                },
                channels: this.channels,
                export_info: {
                    exported_at: new Date().toISOString(),
                    total_channels: this.channels.length
                }
            };
            
            const jsonContent = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lista-${this.listData.name ? this.sanitizeFilename(this.listData.name) : 'compartida'}-${this.shareToken}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showAlert(`Archivo JSON descargado (${this.channels.length} canales)`, 'success');
        } catch (error) {
            console.error('Error exportando JSON:', error);
            this.showAlert('Error al exportar: ' + error.message, 'danger');
        }
    }
    
    copyToClipboard(text) {
        navigator.clipboard.writeText(text)
            .then(() => this.showAlert('URL copiada al portapapeles', 'success'))
            .catch(() => {
                // Fallback para navegadores antiguos
                const tempInput = document.createElement('input');
                tempInput.value = text;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                this.showAlert('URL copiada al portapapeles', 'success');
            });
    }
    
    showError(message) {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.classList.add('d-none');
        }
        
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.classList.remove('d-none');
            const errorMessage = document.getElementById('errorMessage');
            if (errorMessage) {
                errorMessage.textContent = message;
            }
        }
    }
    
    showAlert(message, type) {
        // Implementa tu función de alerta o usa una simple
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 1050;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto-remover después de 5 segundos
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    truncateUrl(url, maxLength) {
        if (!url || url.length <= maxLength) return url || '';
        return url.substring(0, maxLength) + '...';
    }
    
    sanitizeFilename(filename) {
        return filename
            .replace(/[^\w\s.-]/g, '') // Remover caracteres especiales
            .replace(/\s+/g, '-')      // Reemplazar espacios con guiones
            .toLowerCase();
    }
}

// Inicializar cuando se cargue la página
document.addEventListener('DOMContentLoaded', () => {
    new SharedListManager();
});