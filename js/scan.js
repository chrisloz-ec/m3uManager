// scan.js

class M3UScanner {
    constructor() {
        this.scannedChannels = [];
        this.selectedChannels = new Set();
        this.currentListId = null;
        this.categories = [];
        this.currentStep = 1;
        this.currentUser = null;
        this.init();
    }

    getClient() {
        const client = getSupabaseClient();
        if (!client) {
            throw new Error('No se pudo conectar con la base de datos');
        }
        return client;
    }
    
    async init() {
        // Verificar autenticación
        await requireAuth();
        
        // Obtener usuario actual
        this.currentUser = await getCurrentUser(); // Guardar en propiedad
        if (!this.currentUser) return;

        // Inicializar interfaz de usuario
        if (typeof UserUtils !== 'undefined' && UserUtils.initializeUserInterface) {
            await UserUtils.initializeUserInterface();
        } else {
            // Fallback: usar solo updateUserInfo
            if (typeof updateUserInfo === 'function') {
                updateUserInfo(this.currentUser);
            }
        }
        
        // Obtener ID de lista de la URL
        const urlParams = new URLSearchParams(window.location.search);
        this.currentListId = urlParams.get('list');
        
        // Cargar categorías
        await this.loadCategories();
        
        // Cargar listas del usuario para el selector
        await this.loadUserLists();
        
        // Configurar eventos
        this.setupEventListeners();

        // Actualizar información del usuario
        updateUserInfo(this.currentUser); // Usar la función global
    }
    
    async loadCategories() {
        try {
            // Verificar que supabase esté disponible
            const client = this.getClient();
            
            // Obtener categorías por defecto
            const { data: defaultCats, error: defaultError } = await client
                .from('categories')
                .select('*')
                .eq('is_default', true);
            
            if (defaultError) {
                console.error('Error cargando categorías por defecto:', defaultError);
                return;
            }
            
            // Obtener categorías del usuario
            const user = await getCurrentUser();
            if (!user) return;
            
            const { data: userCats, error: userError } = await client
                .from('categories')
                .select('*')
                .eq('user_id', user.id);
            
            if (userError) {
                console.error('Error cargando categorías del usuario:', userError);
            }
            
            this.categories = [...(defaultCats || []), ...(userCats || [])];
            
            // Llenar selector de categoría predeterminada
            this.populateDefaultCategorySelect();
            
        } catch (error) {
            console.error('Error cargando categorías:', error);
            showAlert('Error al cargar categorías', 'danger');
        }
    }
    
    async loadUserLists() {
        try {
            const client = this.getClient();
        
            const user = await getCurrentUser();
            if (!user) return;
            
            const { data: lists, error } = await client
                .from('lists')
                .select('id, name')
                .eq('user_id', user.id)
                .order('name');
            
            if (error) {
                console.error('Error cargando listas:', error);
                return;
            }
            
            const select = document.getElementById('targetList');
            if (!select) return;
            
            select.innerHTML = '<option value="">Seleccionar lista</option>';
            
            lists.forEach(list => {
                const option = document.createElement('option');
                option.value = list.id;
                option.textContent = list.name;
                if (list.id === this.currentListId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            
        } catch (error) {
            console.error('Error cargando listas:', error);
            showAlert('Error al cargar listas', 'danger');
        }
    }
    
    populateDefaultCategorySelect() {
        const select = document.getElementById('defaultCategory');
        if (!select) return;
        
        select.innerHTML = '<option value="">Usar categorías del archivo</option>';
        
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    }
    
    setupEventListeners() {
        // Drag and drop
        this.setupDragAndDrop();
        
        // Selección de archivo
        document.getElementById('m3uFile').addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });
        
        // Remover archivo
        document.getElementById('removeFile')?.addEventListener('click', () => {
            this.resetFileSelection();
        });
        
        // Escanear archivo
        document.getElementById('scanFile')?.addEventListener('click', () => {
            this.scanM3UFile();
        });
        
        // Navegación entre pasos
        document.getElementById('backToStep1')?.addEventListener('click', () => {
            this.goToStep(1);
        });
        
        document.getElementById('continueToImport')?.addEventListener('click', () => {
            this.goToStep(3);
        });
        
        document.getElementById('backToStep2')?.addEventListener('click', () => {
            this.goToStep(2);
        });
        
        // Selección de canales
        document.getElementById('selectAll')?.addEventListener('click', () => {
            this.selectAllChannels();
        });
        
        // Filtros
        document.getElementById('filterScanned')?.addEventListener('input', () => {
            this.filterScannedChannels();
        });
        
        document.getElementById('filterScannedStatus')?.addEventListener('change', () => {
            this.filterScannedChannels();
        });
        
        // Importación
        document.getElementById('startImport')?.addEventListener('click', () => {
            this.startImport();
        });
        
        // Resultados
        document.getElementById('viewImportedChannels')?.addEventListener('click', () => {
            this.viewImportedChannels();
        });
        
        document.getElementById('importAnother')?.addEventListener('click', () => {
            this.resetScanner();
        });
    }
    
    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-primary', 'border-2');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-primary', 'border-2');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary', 'border-2');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });
    }
    
    async handleFileSelect(file) {
        if (!file) return;
        
        // Validar tipo de archivo
        const validExtensions = ['.m3u', '.m3u8', '.txt'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            showAlert('Por favor selecciona un archivo M3U válido (.m3u, .m3u8, .txt)', 'warning');
            return;
        }
        
        // Validar tamaño (10MB máximo)
        const maxSize = 10 * 1024 * 1024; // 10MB en bytes
        if (file.size > maxSize) {
            showAlert('El archivo es demasiado grande. Máximo 10MB.', 'warning');
            return;
        }
        
        // Mostrar información del archivo
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = this.formatFileSize(file.size);
        document.getElementById('fileInfo').classList.remove('d-none');

        document.getElementById('dropZone').classList.add('d-none');
        
        // Guardar referencia al archivo
        this.currentFile = file;
        
        // Validar que se haya seleccionado una lista
        const targetList = document.getElementById('targetList').value;
        if (!targetList) {
            showAlert('Por favor selecciona una lista destino', 'warning');
            return;
        }
    }
    
    resetFileSelection() {
        document.getElementById('m3uFile').value = '';
        document.getElementById('fileInfo').classList.add('d-none');
        document.getElementById('dropZone').classList.remove('d-none');
        this.currentFile = null;
    }
    
    async scanM3UFile() {
        if (!this.currentFile) {
            showAlert('Por favor selecciona un archivo primero', 'warning');
            return;
        }
        
        const targetList = document.getElementById('targetList').value;
        if (!targetList) {
            showAlert('Por favor selecciona una lista destino', 'warning');
            return;
        }
        
        this.currentListId = targetList;
        
        // Mostrar loading
        const scanBtn = document.getElementById('scanFile');
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Escaneando...';
        
        try {
            // Leer archivo
            const content = await this.readFile(this.currentFile);
            
            // Parsear M3U
            const channels = this.parseM3U(content);
            this.scannedChannels = channels;
            
            // Verificar estado si está habilitado
            const verifyEnabled = document.getElementById('verifyChannels').checked;
            if (verifyEnabled) {
                await this.verifyChannelsStatus();
            }
            
            // Mostrar resultados
            this.renderScannedChannels();
            this.goToStep(2);
            
            showAlert(`Se encontraron ${channels.length} canales`, 'success');
            
        } catch (error) {
            console.error('Error escaneando archivo:', error);
            showAlert('Error al procesar el archivo M3U', 'danger');
        } finally {
            // Restaurar botón
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<i class="bi bi-search me-2"></i>Escanear Archivo';
        }
    }
    
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }
    
    parseM3U(content) {
        const channels = [];
        const lines = content.split('\n');
        
        let currentChannel = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTINF:')) {
                currentChannel = this.parseExtInf(line);
            } else if (line && !line.startsWith('#') && currentChannel) {
                currentChannel.stream_url = line;
                channels.push(currentChannel);
                currentChannel = null;
            }
        }
        
        return channels;
    }
    
    parseExtInf(line) {
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
        
        // Si no hay nombre, usar un nombre por defecto
        if (!channel.name) {
            channel.name = `Canal ${this.scannedChannels.length + 1}`;
        }
        
        return channel;
    }
    
    async verifyChannelsStatus() {
        const verifyBtn = document.getElementById('verifyChannels');
        if (!verifyBtn?.checked) return;
        
        showAlert('Verificando estado de canales...', 'info');
        
        for (let i = 0; i < this.scannedChannels.length; i++) {
            const channel = this.scannedChannels[i];
            
            // Actualizar UI
            const row = document.querySelector(`tr[data-channel-index="${i}"]`);
            if (row) {
                const statusCell = row.querySelector('.channel-status');
                if (statusCell) {
                    statusCell.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                }
            }
            
            // Verificar canal
            try {
                const status = await this.checkChannelStatus(channel.stream_url);
                channel.status = status;
            } catch (error) {
                channel.status = 'inactive';
            }
            
            // Actualizar UI
            if (row) {
                const statusCell = row.querySelector('.channel-status');
                if (statusCell) {
                    statusCell.innerHTML = this.getStatusBadge(channel.status);
                }
            }
            
            // Pequeña pausa para no sobrecargar
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        showAlert('Verificación completada', 'success');
    }
    
    async checkChannelStatus(url) {
        return new Promise((resolve) => {
            const timeout = 5000; // 5 segundos
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            })
            .then(() => {
                clearTimeout(timeoutId);
                resolve('active');
            })
            .catch(() => {
                clearTimeout(timeoutId);
                resolve('inactive');
            });
        });
    }
    
    renderScannedChannels() {
        const tbody = document.getElementById('scannedChannelsBody');
        const noChannelsMsg = document.getElementById('noScannedChannels');
        const channelsCount = document.getElementById('channelsCount');
        
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (this.scannedChannels.length === 0) {
            noChannelsMsg.classList.remove('d-none');
            channelsCount.textContent = '0 canales';
            return;
        }
        
        noChannelsMsg.classList.add('d-none');
        channelsCount.textContent = `${this.scannedChannels.length} canal${this.scannedChannels.length !== 1 ? 'es' : ''}`;
        
        // Seleccionar todos por defecto
        this.selectedChannels = new Set(this.scannedChannels.map((_, index) => index));
        
        this.scannedChannels.forEach((channel, index) => {
            const row = document.createElement('tr');
            row.dataset.channelIndex = index;
            row.innerHTML = `
                <td>
                    <input type="checkbox" class="channel-select" data-index="${index}" checked>
                </td>
                <td>
                    ${channel.logo_url ? 
                        `<img src="${channel.logo_url}" alt="${channel.name}" class="channel-logo-sm" width="40"
                              onerror="this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'><rect width=\'40\' height=\'40\' fill=\'%23f8f9fa\'/><text x=\'20\' y=\'22\' text-anchor=\'middle\' font-size=\'12\' fill=\'%236c757d\'>TV</text></svg>'">` :
                        `<div class="logo-placeholder-sm"><i class="bi bi-tv"></i></div>`
                    }
                </td>
                <td>
                    <strong>${escapeHtml(channel.name)}</strong>
                    ${channel.tvg_name ? `<br><small class="text-muted">${escapeHtml(channel.tvg_name)}</small>` : ''}
                </td>
                <td>
                    <span class="badge bg-secondary">${escapeHtml(channel.category || 'General')}</span>
                </td>
                <td>
                    <small class="text-truncate d-block" style="max-width: 200px;" title="${channel.stream_url}">
                        ${escapeHtml(channel.stream_url)}
                    </small>
                </td>
                <td class="channel-status">
                    ${this.getStatusBadge(channel.status)}
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-info preview-channel" data-index="${index}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Actualizar contador de seleccionados
        this.updateSelectedCount();
        
        // Agregar eventos a checkboxes y botones
        this.attachChannelEvents();
    }
    
    getStatusBadge(status) {
        const badges = {
            active: '<span class="badge bg-success">Activo</span>',
            inactive: '<span class="badge bg-danger">Inactivo</span>',
            unknown: '<span class="badge bg-warning">Sin verificar</span>'
        };
        return badges[status] || badges.unknown;
    }
    
    attachChannelEvents() {
        // Checkboxes
        document.querySelectorAll('.channel-select').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (e.target.checked) {
                    this.selectedChannels.add(index);
                } else {
                    this.selectedChannels.delete(index);
                }
                this.updateSelectedCount();
            });
        });
        
        // Checkbox "seleccionar todos"
        document.getElementById('selectAllCheckbox')?.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.channel-select');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const index = parseInt(cb.dataset.index);
                if (e.target.checked) {
                    this.selectedChannels.add(index);
                } else {
                    this.selectedChannels.delete(index);
                }
            });
            this.updateSelectedCount();
        });
        
        // Botones de vista previa
        document.querySelectorAll('.preview-channel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('button').dataset.index);
                this.showChannelPreview(index);
            });
        });
    }
    
    updateSelectedCount() {
        const selectedCount = document.getElementById('selectedCount');
        if (selectedCount) {
            selectedCount.textContent = this.selectedChannels.size;
        }
    }
    
    selectAllChannels() {
        this.selectedChannels = new Set(this.scannedChannels.map((_, index) => index));
        
        document.querySelectorAll('.channel-select').forEach(cb => {
            cb.checked = true;
        });
        
        this.updateSelectedCount();
    }
    
    filterScannedChannels() {
        const searchTerm = document.getElementById('filterScanned').value.toLowerCase();
        const statusFilter = document.getElementById('filterScannedStatus').value;
        
        const rows = document.querySelectorAll('#scannedChannelsBody tr');
        
        rows.forEach(row => {
            const index = parseInt(row.dataset.channelIndex);
            const channel = this.scannedChannels[index];
            
            let matchesSearch = true;
            let matchesStatus = true;
            
            if (searchTerm) {
                matchesSearch = channel.name.toLowerCase().includes(searchTerm) ||
                              (channel.tvg_name && channel.tvg_name.toLowerCase().includes(searchTerm)) ||
                              (channel.category && channel.category.toLowerCase().includes(searchTerm));
            }
            
            if (statusFilter && channel.status !== statusFilter) {
                matchesStatus = false;
            }
            
            row.style.display = matchesSearch && matchesStatus ? '' : 'none';
        });
    }
    
    showChannelPreview(index) {
        const channel = this.scannedChannels[index];
        if (!channel) return;
        
        // Aquí podrías implementar un modal de vista previa
        alert(`Vista previa de: ${channel.name}\n\nURL: ${channel.stream_url}\nCategoría: ${channel.category || 'Ninguna'}\nEstado: ${channel.status}`);
    }
    
    goToStep(step) {
        this.currentStep = step;
        
        // Ocultar todos los pasos
        document.getElementById('step1').classList.add('d-none');
        document.getElementById('step2').classList.add('d-none');
        document.getElementById('step3').classList.add('d-none');
        
        // Mostrar paso actual
        document.getElementById(`step${step}`).classList.remove('d-none');
        
        // Actualizar indicadores de pasos
        this.updateStepIndicators(step);
        
        // Si vamos al paso 3, actualizar resumen
        if (step === 3) {
            this.updateImportSummary();
        }
    }
    
    updateStepIndicators(activeStep) {
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNumber = index + 1;
            if (stepNumber === activeStep) {
                step.classList.add('active');
            } else if (stepNumber < activeStep) {
                step.classList.remove('active');
                step.classList.add('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
    }
    
    updateImportSummary() {
        const selectedChannels = Array.from(this.selectedChannels)
            .map(index => this.scannedChannels[index]);
        
        const activeCount = selectedChannels.filter(c => c.status === 'active').length;
        const inactiveCount = selectedChannels.filter(c => c.status === 'inactive').length;
        const unknownCount = selectedChannels.filter(c => c.status === 'unknown').length;
        
        document.getElementById('totalToImport').textContent = selectedChannels.length;
        document.getElementById('activeToImport').textContent = activeCount;
        document.getElementById('inactiveToImport').textContent = inactiveCount + unknownCount;
    }
    
    async startImport() {
        if (this.selectedChannels.size === 0) {
            showAlert('Por favor selecciona al menos un canal para importar', 'warning');
            return;
        }
        
        const targetList = document.getElementById('targetList').value;
        if (!targetList) {
            showAlert('Por favor selecciona una lista destino', 'warning');
            return;
        }
        
        const selectedChannels = Array.from(this.selectedChannels)
            .map(index => this.scannedChannels[index]);
        
        // Mostrar progreso
        document.getElementById('importProgressContainer').classList.remove('d-none');
        document.getElementById('startImport').disabled = true;
        
        let imported = 0;
        let failed = 0;
        let skipped = 0;
        const startTime = Date.now();
        
        const duplicateAction = document.getElementById('duplicateAction').value;
        const defaultCategory = document.getElementById('defaultCategory').value;
        
        for (let i = 0; i < selectedChannels.length; i++) {
            const channel = selectedChannels[i];
            
            // Actualizar progreso
            const progress = ((i + 1) / selectedChannels.length) * 100;
            document.getElementById('importProgress').style.width = `${progress}%`;
            document.getElementById('importPercent').textContent = `${Math.round(progress)}%`;
            document.getElementById('importStatus').textContent = `Importando: ${channel.name}`;
            
            try {
                // Verificar si el canal ya existe
                const client = this.getClient();
                const { data: existing } = await client
                    .from('channels')
                    .select('id')
                    .eq('list_id', targetList)
                    .eq('stream_url', channel.stream_url)
                    .single();
                
                if (existing) {
                    // Canal duplicado
                    switch(duplicateAction) {
                        case 'skip':
                            skipped++;
                            continue;
                        case 'replace':
                            await this.updateExistingChannel(existing.id, channel, defaultCategory);
                            imported++;
                            break;
                        case 'rename':
                            await this.createRenamedChannel(targetList, channel, defaultCategory, i);
                            imported++;
                            break;
                    }
                } else {
                    // Nuevo canal
                    await this.createNewChannel(targetList, channel, defaultCategory);
                    imported++;
                }
                
            } catch (error) {
                console.error('Error importando canal:', error);
                failed++;
            }
            
            // Actualizar contadores
            document.getElementById('importedCount').textContent = imported;
            document.getElementById('failedCount').textContent = failed;
            document.getElementById('skippedCount').textContent = skipped;
            
            // Pequeña pausa
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Calcular tiempo transcurrido
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        document.getElementById('importTime').textContent = `${elapsedTime}s`;
        
        // Mostrar resultado
        document.getElementById('importResult').classList.remove('d-none');
        document.getElementById('importProgressContainer').classList.add('d-none');
        
        const message = `Importación completada: ${imported} importados, ${failed} fallidos, ${skipped} saltados`;
        document.getElementById('importResultMessage').textContent = message;
        
        showAlert(message, failed === 0 ? 'success' : 'warning');
    }
    
    async createNewChannel(listId, channel, defaultCategoryId) {
        const channelData = {
            list_id: listId,
            name: channel.name,
            tvg_name: channel.tvg_name || null,
            logo_url: channel.logo_url || null,
            stream_url: channel.stream_url,
            category_id: defaultCategoryId || await this.getOrCreateCategory(channel.category),
            status: channel.status,
            last_checked: new Date().toISOString()
        };
        
        const client = this.getClient();
        const { error } = await client
            .from('channels')
            .insert([channelData]);
        
        if (error) throw error;
    }
    
    async updateExistingChannel(channelId, channel, defaultCategoryId) {
        const channelData = {
            name: channel.name,
            tvg_name: channel.tvg_name || null,
            logo_url: channel.logo_url || null,
            category_id: defaultCategoryId || await this.getOrCreateCategory(channel.category),
            status: channel.status,
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const client = this.getClient();
        const { error } = await client
            .from('channels')
            .update(channelData)
            .eq('id', channelId);
        
        if (error) throw error;
    }
    
    async createRenamedChannel(listId, channel, defaultCategoryId, index) {
        const renamedChannel = {
            ...channel,
            name: `${channel.name} (${index + 1})`
        };
        
        await this.createNewChannel(listId, renamedChannel, defaultCategoryId);
    }
    
    async getOrCreateCategory(categoryName) {
        if (!categoryName) return null;
        
        // Buscar categoría existente
        const user = await getCurrentUser();
        const client = this.getClient();
        const { data: existing } = await client
            .from('categories')
            .select('id')
            .eq('name', categoryName)
            .eq('user_id', user.id)
            .single();
        
        if (existing) return existing.id;
        
        // Crear nueva categoría
        const { data: newCategory } = await client
            .from('categories')
            .insert([{
                name: categoryName,
                user_id: user.id,
                is_default: false
            }])
            .select()
            .single();
        
        return newCategory?.id || null;
    }
    
    viewImportedChannels() {
        if (this.currentListId) {
            window.location.href = `channels.html?list=${this.currentListId}`;
        }
    }
    
    resetScanner() {
        // Resetear todo
        this.scannedChannels = [];
        this.selectedChannels = new Set();
        this.currentFile = null;
        
        // Resetear UI
        this.resetFileSelection();
        document.getElementById('scannedChannelsBody').innerHTML = '';
        document.getElementById('noScannedChannels').classList.remove('d-none');
        document.getElementById('importResult').classList.add('d-none');
        
        // Volver al paso 1
        this.goToStep(1);
    }
    
    
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Verificar que las dependencias estén cargadas
    if (typeof supabase === 'undefined' && typeof window.supabase === 'undefined') {
        console.error('Supabase no está cargado. Asegúrate de incluir el SDK de Supabase antes de scan.js');
        showAlert('Error de configuración. Por favor recarga la página.', 'danger');
        return;
    }
    window.scanner = new M3UScanner();
});