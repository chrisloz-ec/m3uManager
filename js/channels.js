// channels.js - VERSIÓN CORREGIDA

// Función para obtener el ID de la lista desde la URL
function getCurrentListId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('list');
}

// Gestión de Canales
class ChannelManager {
    constructor() {
        this.currentListId = null;
        this.categories = [];
        this.channels = [];
        this.client = null;
        this.currentUser = null;
        this.activeModal = null; // Para rastrear el modal activo
    }

    async init(listId) {
        this.currentListId = listId;
        
        // Verificar autenticación
        if (typeof requireAuth === 'function') {
            await requireAuth();
        }
        
        // Obtener usuario actual
        if (typeof getCurrentUser === 'function') {
            this.currentUser = await getCurrentUser();
            if (!this.currentUser) {
                window.location.href = 'login.html';
                return;
            }
        }
        
        // Obtener cliente Supabase
        if (typeof getSupabaseClient === 'function') {
            this.client = getSupabaseClient();
            if (!this.client) {
                showAlert('Error de conexión con la base de datos', 'danger');
                return;
            }
        } else {
            console.error('getSupabaseClient no está definido');
            showAlert('Error de configuración', 'danger');
            return;
        }
        
        await this.loadCategories();
        await this.loadChannels();
        this.setupEventListeners();
        
        // Actualizar información del usuario
        if (typeof updateUserInfo === 'function') {
            updateUserInfo(this.currentUser);
        }
    }

    async loadCategories() {
        try {
            if (!this.client) {
                console.error('Cliente Supabase no disponible');
                return;
            }
            
            // Obtener categorías por defecto
            const { data: defaultCats, error: defaultError } = await this.client
                .from('categories')
                .select('*')
                .eq('is_default', true);

            if (defaultError) throw defaultError;

            // Obtener categorías del usuario
            let userCats = [];
            if (this.currentUser) {
                const { data: userData, error: userError } = await this.client
                    .from('categories')
                    .select('*')
                    .eq('user_id', this.currentUser.id);

                if (userError) throw userError;
                userCats = userData || [];
            }

            this.categories = [...(defaultCats || []), ...userCats];
            this.populateCategorySelect();
        } catch (error) {
            console.error('Error cargando categorías:', error);
            showAlert('Error al cargar categorías', 'danger');
        }
    }

    async loadChannels() {
        try {
            if (!this.client) {
                console.error('Cliente Supabase no disponible');
                return;
            }
            
            const { data, error } = await this.client.from('channels')
                .select(`
                    *,
                    categories(name)
                `)
                .eq('list_id', this.currentListId)
                .order('name');

            if (error) throw error;

            this.channels = data || [];
            this.renderChannelsTable();
            
            // Verificar estados si es necesario
            this.checkChannelsStatus();
        } catch (error) {
            console.error('Error cargando canales:', error);
            showAlert('Error al cargar canales', 'danger');
        }
    }

    async checkChannelsStatus() {
        if (!this.client) return;
        
        // Verificar canales que necesitan actualización
        const channelsToCheck = this.channels.filter(channel => {
            return channel.status === 'unknown' || 
                   !channel.last_checked || 
                   new Date() - new Date(channel.last_checked) > 3600000; // 1 hora
        });

        for (const channel of channelsToCheck) {
            await this.checkSingleChannel(channel.id, channel.stream_url);
        }
    }

    async checkSingleChannel(channelId, url) {
        if (!this.client) return;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Intentar verificar la URL
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            // Actualizar estado en la base de datos
            await this.client
                .from('channels')
                .update({
                    status: 'active',
                    last_checked: new Date().toISOString()
                })
                .eq('id', channelId);

            // Actualizar en la tabla local
            const channelIndex = this.channels.findIndex(c => c.id === channelId);
            if (channelIndex !== -1) {
                this.channels[channelIndex].status = 'active';
                this.channels[channelIndex].last_checked = new Date().toISOString();
                this.updateChannelRow(channelId);
            }
        } catch (error) {
            // Actualizar como inactivo
            await this.client
                .from('channels')
                .update({
                    status: 'inactive',
                    last_checked: new Date().toISOString()
                })
                .eq('id', channelId);

            const channelIndex = this.channels.findIndex(c => c.id === channelId);
            if (channelIndex !== -1) {
                this.channels[channelIndex].status = 'inactive';
                this.channels[channelIndex].last_checked = new Date().toISOString();
                this.updateChannelRow(channelId);
            }
        }
    }

    populateCategorySelect() {
        const select = document.getElementById('channelCategory');
        if (!select) return;

        select.innerHTML = '<option value="">Seleccionar categoría</option>';
        
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });

        // Agregar opción para nueva categoría
        const newOption = document.createElement('option');
        newOption.value = 'new';
        newOption.textContent = '+ Agregar nueva categoría';
        select.appendChild(newOption);
    }

    setupTableEvents() {
        // Usar delegación de eventos para los botones dinámicos
        document.addEventListener('click', (e) => {
            // Botón ver detalles
            if (e.target.closest('.view-channel')) {
                const btn = e.target.closest('.view-channel');
                const channelId = btn.dataset.id;
                this.viewChannelDetails(channelId);
            }
            
            // Botón editar
            if (e.target.closest('.edit-channel')) {
                const btn = e.target.closest('.edit-channel');
                const channelId = btn.dataset.id;
                this.editChannel(channelId);
            }
            
            // Botón eliminar
            if (e.target.closest('.delete-channel')) {
                const btn = e.target.closest('.delete-channel');
                const channelId = btn.dataset.id;
                this.confirmDeleteChannel(channelId);
            }
        });
    }

    renderChannelsTable() {
        const tbody = document.getElementById('channelsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.channels.length === 0) {
            document.getElementById('noChannelsMessage')?.classList.remove('d-none');
            return;
        } else {
            document.getElementById('noChannelsMessage')?.classList.add('d-none');
        }

        this.channels.forEach((channel, index) => {
            const row = document.createElement('tr');
            row.dataset.channelId = channel.id;
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>
                    ${channel.logo_url ? 
                        `<img src="${channel.logo_url}" alt="${channel.name}" class="channel-logo" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.src='assets/default-logo.png'">` :
                        `<div class="logo-placeholder" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: #e9ecef; border-radius: 4px;">
                            <i class="bi bi-tv text-muted"></i>
                        </div>`
                    }
                </td>
                <td>${escapeHtml(channel.name)}</td>
                <td>${escapeHtml(channel.tvg_name || '-')}</td>
                <td>
                    <span class="badge bg-secondary">${escapeHtml(channel.categories?.name || 'Sin categoría')}</span>
                </td>
                <td>
                    <span class="status-badge ${channel.status || 'unknown'}">
                        ${channel.status === 'active' ? 'Activo' : 
                         channel.status === 'inactive' ? 'Inactivo' : 'Desconocido'}
                    </span>
                </td>
                <td>
                    ${channel.last_checked ? 
                        new Date(channel.last_checked).toLocaleDateString() : 
                        'No verificada'}
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary view-channel" data-id="${channel.id}" title="Ver detalles">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-outline-success edit-channel" data-id="${channel.id}" title="Editar">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger delete-channel" data-id="${channel.id}" title="Eliminar">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    attachTableEvents() {
        // Botón ver
        document.querySelectorAll('.view-channel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const channelId = e.target.closest('button').dataset.id;
                this.viewChannelDetails(channelId);
            });
        });

        // Botón editar
        document.querySelectorAll('.edit-channel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const channelId = e.target.closest('button').dataset.id;
                this.editChannel(channelId);
            });
        });

        // Botón eliminar
        document.querySelectorAll('.delete-channel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const channelId = e.target.closest('button').dataset.id;
                this.deleteChannel(channelId);
            });
        });
    }

    async viewChannelDetails(channelId) {
        try {
            const channel = this.channels.find(c => c.id === channelId);
            if (!channel) return;

            // Cerrar modal activo primero
            this.closeActiveModal();

            const modalBody = document.getElementById('channelDetailsBody');
            if (!modalBody) return;

            modalBody.innerHTML = `
                <div class="row">
                    <div class="col-md-3 text-center">
                        ${channel.logo_url ? 
                            `<img src="${channel.logo_url}" alt="${channel.name}" class="img-fluid rounded mb-3" style="max-height: 150px;">` :
                            `<div class="logo-placeholder-large" style="width: 150px; height: 150px; display: flex; align-items: center; justify-content: center; background: #e9ecef; border-radius: 8px; margin: 0 auto;">
                                <i class="bi bi-tv" style="font-size: 3rem; color: #6c757d;"></i>
                            </div>`
                        }
                    </div>
                    <div class="col-md-9">
                        <h4>${escapeHtml(channel.name)}</h4>
                        <div class="table-responsive">
                            <table class="table table-sm align-middle">
                                <tr>
                                    <th style="width: 140px;">ID TVG:</th>
                                    <td>${escapeHtml(channel.tvg_name || 'No especificado')}</td>
                                </tr>
                                <tr>
                                    <th>Categoría:</th>
                                    <td>${escapeHtml(channel.categories?.name || 'Sin categoría')}</td>
                                </tr>
                                <tr>
                                    <th>Estado:</th>
                                    <td>
                                        <span class="status-badge ${channel.status || 'unknown'}">
                                            ${channel.status === 'active' ? 'Activo' : 
                                             channel.status === 'inactive' ? 'Inactivo' : 'Desconocido'}
                                        </span>
                                    </td>
                                </tr>
                                <tr>
                                    <th>URL Stream:</th>
                                    <td><small class="text-break" style="word-break: break-all;">${escapeHtml(channel.stream_url)}</small></td>
                                </tr>
                                <tr>
                                    <th>Última verificación:</th>
                                    <td>${channel.last_checked ? 
                                        new Date(channel.last_checked).toLocaleString() : 
                                        'No verificada'}</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            // Mostrar modal con retraso
            setTimeout(() => {
                this.showModal('channelDetailsModal');
            }, 100);

        } catch (error) {
            console.error('Error mostrando detalles:', error);
            showAlert('Error al cargar detalles del canal', 'danger');
        }
    }

    async editChannel(channelId) {
        try {
            const channel = this.channels.find(c => c.id === channelId);
            if (!channel) return;

            // 1. Llenar formulario con los datos del canal
            document.getElementById('channelId').value = channel.id;
            document.getElementById('channelName').value = channel.name || '';
            document.getElementById('tvgName').value = channel.tvg_name || '';
            document.getElementById('logoUrl').value = channel.logo_url || '';
            document.getElementById('streamUrl').value = channel.stream_url || '';
            
            // 2. Cargar categorías en el selector y seleccionar la correcta
            const categorySelect = document.getElementById('channelCategory');
            if (categorySelect) {
                categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
                this.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    if (category.id === channel.category_id) {
                        option.selected = true;
                    }
                    categorySelect.appendChild(option);
                });
            }

            // 3. Configurar modal para edición
            document.getElementById('channelModalTitle').textContent = 'Editar Canal';
            document.getElementById('channelBtnText').textContent = 'Guardar Cambios';

            // 4. Mostrar el modal
            const modalElement = document.getElementById('channelModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();

        } catch (error) {
            console.error('Error preparando edición:', error);
            showAlert('Error al cargar datos del canal', 'danger');
        }
    }


    async addChannel() {
        const form = document.getElementById('channelForm');
        if (!form) return;
        
        const channelData = {
            list_id: this.currentListId,
            name: document.getElementById('channelName')?.value.trim() || '',
            tvg_name: document.getElementById('tvgName')?.value.trim() || '',
            logo_url: document.getElementById('logoUrl')?.value.trim() || '',
            stream_url: document.getElementById('streamUrl')?.value.trim() || '',
            category_id: document.getElementById('channelCategory')?.value || null,
            status: 'unknown'
        };

        // Validar datos
        if (!this.validateChannelData(channelData)) {
            return;
        }

        try {
            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }
            
            const { data, error } = await this.client.from('channels')
                .insert([channelData])
                .select();

            if (error) throw error;

            // Recargar canales
            await this.loadChannels();
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('addChannelModal'));
            if (modal) modal.hide();
            
            // Limpiar formulario
            form.reset();
            
            showAlert('Canal agregado exitosamente', 'success');
        } catch (error) {
            console.error('Error agregando canal:', error);
            showAlert('Error al agregar canal: ' + error.message, 'danger');
        }
    }

    async updateChannel(channelId) {
        const channelData = {
            name: document.getElementById('channelName')?.value.trim() || '',
            tvg_name: document.getElementById('tvgName')?.value.trim() || '',
            logo_url: document.getElementById('logoUrl')?.value.trim() || '',
            stream_url: document.getElementById('streamUrl')?.value.trim() || '',
            category_id: document.getElementById('channelCategory')?.value || null
        };

        if (!this.validateChannelData(channelData)) {
            return;
        }

        try {
            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }
            
            const { error } = await this.client
                .from('channels')
                .update(channelData)
                .eq('id', channelId);

            if (error) throw error;

            await this.loadChannels();
            showAlert('Canal actualizado exitosamente', 'success');
        } catch (error) {
            console.error('Error actualizando canal:', error);
            showAlert('Error al actualizar canal: ' + error.message, 'danger');
        }
    }

    async deleteChannel(channelId) {
        if (!confirm('¿Estás seguro de eliminar este canal?')) return;

        try {
            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }
            
            const { error } = await this.client
                .from('channels')
                .delete()
                .eq('id', channelId);

            if (error) throw error;

            await this.loadChannels();
            showAlert('Canal eliminado exitosamente', 'success');
        } catch (error) {
            console.error('Error eliminando canal:', error);
            showAlert('Error al eliminar canal: ' + error.message, 'danger');
        }
    }

    validateChannelData(data) {
        // Validar nombre
        if (!data.name || data.name.length < 3) {
            showAlert('El nombre debe tener al menos 3 caracteres', 'warning');
            return false;
        }

        // Validar URL de stream
        try {
            new URL(data.stream_url);
        } catch {
            showAlert('La URL del stream no es válida', 'warning');
            return false;
        }

        // Validar URL del logo si existe
        if (data.logo_url && data.logo_url.trim() !== '') {
            try {
                new URL(data.logo_url);
            } catch {
                showAlert('La URL del logo no es válida', 'warning');
                return false;
            }
        }

        return true;
    }

    setupEventListeners() {
        // Botón agregar canal
        const addChannelBtn = document.getElementById('addChannelBtn');
        if (addChannelBtn) {
            addChannelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAddChannelModal();
            });
        }

        document.getElementById('addChannelBtn')?.addEventListener('click', (e) => {
            this.resetChannelForm();
        });

        // Botón importar M3U
        const importButtons = [
            document.getElementById('importM3UBtn'),
            document.getElementById('importM3UBtn2')
        ];
        
        importButtons.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    window.location.href = `scan.html?list=${this.currentListId}`;
                });
            }
        });

        // Formulario de canal
        const channelForm = document.getElementById('channelForm');
        if (channelForm) {
            channelForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleChannelFormSubmit();
            });
        }

        // Botón confirmar eliminación
        const confirmDeleteBtn = document.getElementById('confirmDeleteChannel');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                const channelId = confirmDeleteBtn.dataset.channelId;
                if (channelId) {
                    await this.deleteChannel(channelId);
                }
            });
        }

        // Botón refrescar
        const refreshBtn = document.getElementById('refreshChannels');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await this.loadChannels();
            });
        }

        // Eventos delegados para la tabla
        this.setupTableEvents();

        // Agrega esto al final de init() o setupEventListeners():
        document.getElementById('channelModal')?.addEventListener('hidden.bs.modal', () => {
            this.resetChannelForm();
        });


        document.getElementById('exportM3U')?.addEventListener('click', () => this.exportToM3U());
        document.getElementById('exportJSON')?.addEventListener('click', () => this.exportToJSON());
        document.getElementById('generateLink')?.addEventListener('click', () => this.generateShareableLink());
    }
    
    showAddChannelModal() {
        // Cerrar modal activo primero
        this.closeActiveModal();
        
        // Limpiar formulario
        const form = document.getElementById('channelForm');
        if (form) {
            form.reset();
            form.classList.remove('was-validated');
        }

        // Configurar para nuevo canal
        document.getElementById('channelModalTitle').textContent = 'Agregar Canal';
        document.getElementById('channelBtnText').textContent = 'Agregar Canal';
        document.getElementById('channelId').value = '';

        // Cargar categorías
        const categorySelect = document.getElementById('channelCategory');
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
            this.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelect.appendChild(option);
            });
        }

        // Mostrar modal con retraso
        setTimeout(() => {
            this.showModal('addChannelModal');
        }, 100);
    }
    
    async handleChannelFormSubmit() {
        const form = document.getElementById('channelForm');
        if (!form) return;

        // Validar formulario
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        const channelId = document.getElementById('channelId').value;
        const isEdit = !!channelId;

        try {
            if (isEdit) {
                await this.updateChannel(channelId);
            } else {
                await this.addChannel();
            }
        } catch (error) {
            console.error('Error en formulario:', error);
            showAlert('Error al procesar el formulario', 'danger');
        }
    }
    
    async addChannel() {
        try {
            const channelData = this.getFormData();
            
            if (!this.validateChannelData(channelData)) {
                return;
            }

            channelData.list_id = this.currentListId;
            channelData.status = 'unknown';
            channelData.created_at = new Date().toISOString();

            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }

            // Mostrar spinner
            this.toggleSubmitButton(true, 'Guardando...');

            const { data, error } = await this.client
                .from('channels')
                .insert([channelData])
                .select();

            if (error) throw error;

            // Cerrar modal
            if (this.currentModal) {
                this.currentModal.hide();
            }

            // Recargar canales
            await this.loadChannels();

            showAlert('Canal agregado exitosamente', 'success');

        } catch (error) {
            console.error('Error agregando canal:', error);
            showAlert('Error al agregar canal: ' + error.message, 'danger');
        } finally {
            this.toggleSubmitButton(false, 'Agregar Canal');
        }
    }
    
    async updateChannel(channelId) {
        try {
            const channelData = this.getFormData();
            
            if (!this.validateChannelData(channelData)) {
                return;
            }

            channelData.updated_at = new Date().toISOString();

            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }

            // Mostrar spinner
            this.toggleSubmitButton(true, 'Actualizando...');

            const { error } = await this.client
                .from('channels')
                .update(channelData)
                .eq('id', channelId);

            if (error) throw error;

            // Cerrar modal
            if (this.currentModal) {
                this.currentModal.hide();
            }

            // Recargar canales
            await this.loadChannels();

            showAlert('Canal actualizado exitosamente', 'success');

        } catch (error) {
            console.error('Error actualizando canal:', error);
            showAlert('Error al actualizar canal: ' + error.message, 'danger');
        } finally {
            this.toggleSubmitButton(false, 'Guardar Cambios');
        }
    }
    
    // Helper functions
    getFormData() {
        return {
            name: document.getElementById('channelName')?.value.trim() || '',
            tvg_name: document.getElementById('tvgName')?.value.trim() || '',
            logo_url: document.getElementById('logoUrl')?.value.trim() || '',
            stream_url: document.getElementById('streamUrl')?.value.trim() || '',
            category_id: document.getElementById('channelCategory')?.value || null
        };
    }

    toggleSubmitButton(loading, text) {
        const submitBtn = document.getElementById('channelSubmitBtn');
        const spinner = document.getElementById('channelSpinner');
        const btnText = document.getElementById('channelBtnText');
        
        if (submitBtn) submitBtn.disabled = loading;
        if (spinner) spinner.classList.toggle('d-none', !loading);
        if (btnText) btnText.textContent = text;
    }
    
    validateChannelData(data) {
        // Validar nombre
        if (!data.name || data.name.length < 3) {
            showAlert('El nombre debe tener al menos 3 caracteres', 'warning');
            return false;
        }
        
        // Validar URL de stream
        if (!data.stream_url || data.stream_url.trim() === '') {
            showAlert('La URL del stream es obligatoria', 'warning');
            return false;
        }
        
        try {
            new URL(data.stream_url);
        } catch {
            showAlert('La URL del stream no es válida', 'warning');
            return false;
        }
        
        // Validar URL del logo si existe
        if (data.logo_url && data.logo_url.trim() !== '') {
            try {
                new URL(data.logo_url);
            } catch {
                showAlert('La URL del logo no es válida', 'warning');
                return false;
            }
        }
        
        return true;
    }
    
    setupActionButtons() {
        // Botón editar canal (evento delegado)
        document.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-channel');
            if (editBtn) {
                e.preventDefault();
                const channelId = editBtn.dataset.id;
                this.editChannel(channelId);
            }
        });
        
        // Botón ver detalles
        document.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.view-channel');
            if (viewBtn) {
                e.preventDefault();
                const channelId = viewBtn.dataset.id;
                this.viewChannelDetails(channelId);
            }
        });
        
        // Botón eliminar canal
        document.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-channel');
            if (deleteBtn) {
                e.preventDefault();
                const channelId = deleteBtn.dataset.id;
                this.confirmDeleteChannel(channelId);
            }
        });
        
        // Confirmar eliminación
        const confirmDeleteBtn = document.getElementById('confirmDeleteChannel');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                const channelId = confirmDeleteBtn.dataset.channelId;
                await this.deleteChannel(channelId);
            });
        }
    }
    
    async editChannel(channelId) {
        try {
            const channel = this.channels.find(c => c.id === channelId);
            if (!channel) return;

            // Llenar formulario
            document.getElementById('channelId').value = channel.id;
            document.getElementById('channelName').value = channel.name || '';
            document.getElementById('tvgName').value = channel.tvg_name || '';
            document.getElementById('logoUrl').value = channel.logo_url || '';
            document.getElementById('streamUrl').value = channel.stream_url || '';
            
            // Cargar categorías en el selector
            const categorySelect = document.getElementById('channelCategory');
            if (categorySelect) {
                categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
                this.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    option.selected = (category.id === channel.category_id);
                    categorySelect.appendChild(option);
                });
            }

            // Configurar modal para edición
            document.getElementById('channelModalTitle').textContent = 'Editar Canal';
            document.getElementById('channelBtnText').textContent = 'Guardar Cambios';

            // Cerrar cualquier modal existente
            if (this.currentModal) {
                this.currentModal.hide();
            }

            // Crear y mostrar nuevo modal
            const modalElement = document.getElementById('addChannelModal');
            const modal = new bootstrap.Modal(modalElement);
            this.currentModal = modal;
            
            // Limpiar al cerrar
            modalElement.addEventListener('hidden.bs.modal', () => {
                this.currentModal = null;
            });

            modal.show();

        } catch (error) {
            console.error('Error preparando edición:', error);
            showAlert('Error al cargar datos del canal', 'danger');
        }
    }
    
    async confirmDeleteChannel(channelId) {
        try {
            const channel = this.channels.find(c => c.id === channelId);
            if (!channel) return;

            // Cerrar modal activo primero
            this.closeActiveModal();

            // Configurar modal de confirmación
            document.getElementById('deleteChannelName').textContent = channel.name;
            document.getElementById('confirmDeleteChannel').dataset.channelId = channelId;

            // Mostrar modal con retraso
            setTimeout(() => {
                this.showModal('deleteChannelModal');
            }, 100);

        } catch (error) {
            console.error('Error preparando eliminación:', error);
            showAlert('Error al preparar eliminación', 'danger');
        }
    }
    
    async deleteChannel(channelId) {
        try {
            if (!confirm('¿Estás seguro de eliminar este canal?')) {
                return;
            }

            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }

            // Cerrar modal de confirmación
            if (this.currentModal) {
                this.currentModal.hide();
            }

            const { error } = await this.client
                .from('channels')
                .delete()
                .eq('id', channelId);

            if (error) throw error;

            // Recargar canales
            await this.loadChannels();

            showAlert('Canal eliminado exitosamente', 'success');

        } catch (error) {
            console.error('Error eliminando canal:', error);
            showAlert('Error al eliminar canal: ' + error.message, 'danger');
        }
    }

    // Nueva función para mostrar modales de forma segura
    // Agrega estas funciones en tu clase ChannelManager:

    showModal(modalId) {
        const modalElement = document.getElementById(modalId);
        if (!modalElement) return;
        
        // Cerrar modal activo primero
        if (this.activeModal) {
            this.activeModal.hide();
        }
        
        // Crear y mostrar nuevo modal
        this.activeModal = new bootstrap.Modal(modalElement);
        this.activeModal.show();
    }

    closeActiveModal() {
        if (this.activeModal) {
            this.activeModal.hide();
            this.activeModal = null;
        }
        
        // Limpiar backdrop residual
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        
        // Limpiar estilos del body
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }

    // Función para cerrar modal activo
    closeActiveModal() {
        if (this.activeModal) {
            this.activeModal.hide();
            this.activeModal = null;
        }
        
        // Limpiar backdrop residual
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        
        // Limpiar estilos del body
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }

    cleanupModalBackdrops() {
        // Remover todos los backdrops
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => {
            backdrop.parentNode.removeChild(backdrop);
        });
        
        // Remover clases del body
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        
        // Remover modales ocultos
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.classList.remove('show');
            modal.style.display = 'none';
        });
    }

    showNewCategoryInput() {
        const categorySelect = document.getElementById('channelCategory');
        const container = categorySelect?.parentElement;
        if (!container) return;
        
        // Eliminar input anterior si existe
        const existingInput = container.querySelector('.new-category-input');
        if (existingInput) existingInput.remove();
        
        // Crear input para nueva categoría
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group mt-2 new-category-input';
        inputGroup.innerHTML = `
            <input type="text" class="form-control" id="newCategoryName" placeholder="Nombre de la nueva categoría">
            <button class="btn btn-success" type="button" id="saveNewCategory">
                <i class="bi bi-check"></i>
            </button>
        `;
        
        container.appendChild(inputGroup);
        
        // Guardar nueva categoría
        const saveBtn = document.getElementById('saveNewCategory');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.saveNewCategory();
            });
        }
    }

    async saveNewCategory() {
        const categoryName = document.getElementById('newCategoryName')?.value.trim();
        
        if (!categoryName || categoryName.length < 2) {
            showAlert('El nombre de la categoría debe tener al menos 2 caracteres', 'warning');
            return;
        }

        try {
            if (!this.client || !this.currentUser) {
                showAlert('Error de configuración', 'danger');
                return;
            }
            
            const { data, error } = await this.client
                .from('categories')
                .insert([{
                    name: categoryName,
                    user_id: this.currentUser.id,
                    is_default: false
                }])
                .select()
                .single();

            if (error) throw error;

            // Agregar al selector
            const categorySelect = document.getElementById('channelCategory');
            if (categorySelect) {
                const option = document.createElement('option');
                option.value = data.id;
                option.textContent = data.name;
                const lastOption = categorySelect.querySelector('option[value="new"]');
                if (lastOption) {
                    categorySelect.insertBefore(option, lastOption);
                } else {
                    categorySelect.appendChild(option);
                }
                
                // Seleccionar la nueva categoría
                categorySelect.value = data.id;
            }
            
            // Remover input
            const inputGroup = document.querySelector('.new-category-input');
            if (inputGroup) inputGroup.remove();
            
            showAlert('Categoría agregada exitosamente', 'success');
        } catch (error) {
            console.error('Error agregando categoría:', error);
            showAlert('Error al agregar categoría: ' + error.message, 'danger');
        }
    }

    exportChannels() {
        if (this.channels.length === 0) {
            showAlert('No hay canales para exportar', 'warning');
            return;
        }

        // Cerrar modal activo primero
        this.closeActiveModal();

        // Mostrar modal de exportación con retraso
        setTimeout(() => {
            this.showModal('exportModal');
        }, 100);
    }

    exportToM3U() {
        let m3uContent = '#EXTM3U\n';
        
        this.channels.forEach(channel => {
            m3uContent += `#EXTINF:-1 tvg-id="${channel.tvg_name || ''}" `;
            m3uContent += `tvg-name="${escapeHtml(channel.name)}" `;
            m3uContent += `tvg-logo="${channel.logo_url || ''}" `;
            m3uContent += `group-title="${escapeHtml(channel.categories?.name || 'General')}",`;
            m3uContent += `${escapeHtml(channel.name)}\n`;
            m3uContent += `${channel.stream_url}\n`;
        });

        // Descargar archivo
        const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lista-canales-${this.currentListId}.m3u`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showAlert('Archivo M3U descargado exitosamente', 'success');
    }

    exportToJSON() {
        const jsonContent = JSON.stringify(this.channels, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lista-canales-${this.currentListId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showAlert('Archivo JSON descargado exitosamente', 'success');
    }

    async generateShareableLink() {
        try {
            if (!this.client) {
                showAlert('Error de conexión', 'danger');
                return;
            }
            
            // Crear token único para compartir
            //const shareToken = Math.random().toString(36).substring(2) + Date.now().toString(36);

            // Generar token SEGURO (sin /)
            const shareToken = this.generateSafeToken();
            console.log('Nuevo token generado:', shareToken);
            
            // Actualizar lista con token
            const { error } = await this.client
                .from('lists')
                .update({
                    share_token: shareToken,
                    is_public: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentListId);

            if (error) throw error;

            // Generar URL
            //const shareUrl = `${window.location.origin}/shared/${shareToken}`;
            //const shareUrl = `${window.location.origin}/M3Umanager/shared/${shareToken}`;
            const shareUrl = `${window.location.origin}/M3Umanager/shared/?token=${shareToken}`;
            //const shareUrl = `${window.location.origin}${window.location.pathname.includes('M3Umanager') ? '/M3Umanager' : ''}/shared/${shareToken}`;

            const shareLinkSection = document.getElementById('shareLinkSection');
            if (shareLinkSection) {
                shareLinkSection.classList.remove('d-none'); // Eliminar la clase que oculta
            }
            
            // Mostrar en modal
            const linkInput = document.getElementById('shareLink');
            if (linkInput) linkInput.value = shareUrl;
            
            // Botón para copiar
            const copyBtn = document.getElementById('copyLink');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    if (linkInput) {
                        linkInput.select();
                        document.execCommand('copy');
                        showAlert('Enlace copiado al portapapeles', 'success');
                    }
                };
            }
            
            showAlert('Enlace compartible generado', 'success');
        } catch (error) {
            console.error('Error generando enlace:', error);
            showAlert('Error al generar enlace: ' + error.message, 'danger');
        }
    }

// FUNCIÓN MEJORADA para generar tokens seguros
generateSafeToken() {
    // Caracteres SEGUROS (sin /, ?, &, =, +, etc.)
    const safeChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
    let token = '';
    
    // Generar parte aleatoria
    const randomPartLength = 20;
    for (let i = 0; i < randomPartLength; i++) {
        token += safeChars.charAt(Math.floor(Math.random() * safeChars.length));
    }
    
    // Agregar timestamp (sin /)
    const timestamp = Date.now().toString(36);
    token += timestamp;
    
    // Verificar que no tenga /
    if (token.includes('/')) {
        token = token.replace(/\//g, '-');
    }
    
    console.log('Token generado (sin /):', token);
    return token;
}


    updateChannelRow(channelId) {
        // Esta función sería para actualizar una fila específica
        // Implementa según sea necesario
        console.log('Actualizar fila del canal:', channelId);
    }

    resetChannelForm() {
        const form = document.getElementById('channelForm');
        if (form) {
            form.reset();
            form.classList.remove('was-validated');
        }
        
        document.getElementById('channelModalTitle').textContent = 'Agregar Canal';
        document.getElementById('channelBtnText').textContent = 'Agregar Canal';
        document.getElementById('channelId').value = '';
        
        // Limpiar selector de categorías
        const categorySelect = document.getElementById('channelCategory');
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';
            this.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelect.appendChild(option);
            });
        }
    }
}


// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    // Obtener ID de lista de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const listId = urlParams.get('list');
    
    if (!listId) {
        showAlert('No se especificó una lista', 'danger');
        window.location.href = 'lists.html';
        return;
    }
    
    try {
        // Cargar información de la lista
        if (typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            const { data: list, error } = await client
                .from('lists')
                .select('name')
                .eq('id', listId)
                .single();
                
            if (error) throw error;
            
            // Actualizar título
            const title = document.getElementById('listTitle');
            if (title && list) {
                title.textContent = `Canales: ${list.name}`;
            }
        }
    } catch (error) {
        console.error('Error cargando información de la lista:', error);
    }
    
    // Inicializar el administrador de canales
    const channelManager = new ChannelManager();
    await channelManager.init(listId);
});


// Inicializar validación de Bootstrap
document.addEventListener('DOMContentLoaded', function() {
    // Validación de formularios
    const forms = document.querySelectorAll('.needs-validation');
    
    Array.from(forms).forEach(function(form) {
        form.addEventListener('submit', function(event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            
            form.classList.add('was-validated');
        }, false);
    });
});