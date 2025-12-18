// lists.js - VERSIÓN CORREGIDA
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== LISTS.JS INICIADO ===');
    

    // Función para escapar HTML y prevenir XSS
    function escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Otra opción más completa:
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

    
    // Verificar autenticación
    if (typeof requireAuth === 'function') {
        requireAuth().then(session => {
            if (!session) return;
            initializeLists();
        });
    } else {
        window.location.href = 'login.html';
    }
    
    async function initializeLists() {
        try {
            const user = await getCurrentUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            
            // Cargar listas
            await loadLists();
            
            // Configurar eventos
            setupEventListeners();
            
            // Actualizar información del usuario
            updateUserInfo(user);
            
        } catch (error) {
            console.error('Error inicializando lists:', error);
        }
    }
    
    async function loadLists() {
    try {
        const client = getSupabaseClient();
        if (!client) {
            showAlert('Error de conexión con la base de datos', 'danger');
            return;
        }
        
        const user = await getCurrentUser();
        if (!user) return;
        
        console.log('Cargando listas para usuario:', user.id);
        
        // Opción más simple y funcional
        const { data, error } = await client
            .from('lists')
            .select(`
                *,
                channels (id)  // Solo obtenemos los IDs para contar
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error cargando listas:', error);
            showAlert('Error al cargar las listas', 'danger');
            return;
        }
        
        // Transformar datos para incluir conteo
        window.listsData = data.map(list => ({
            ...list,
            channels_count: list.channels?.length || 0
        }));
        
        renderLists();
        
        // Actualizar contador
        const listCount = document.getElementById('listCount');
        if (listCount) {
            listCount.textContent = `${window.listsData.length} lista${window.listsData.length !== 1 ? 's' : ''}`;
        }
        
        // Mostrar/ocultar mensaje
        const noListsMessage = document.getElementById('noListsMessage');
        if (noListsMessage) {
            noListsMessage.classList.toggle('d-none', window.listsData.length > 0);
        }
        
    } catch (error) {
        console.error('Error en loadLists:', error);
        showAlert('Error al cargar las listas', 'danger');
    }
}
    
    function renderLists() {
        const container = document.getElementById('listsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!window.listsData || window.listsData.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-list-ul text-muted" style="font-size: 4rem;"></i>
                    <h3 class="mt-3">No hay listas creadas</h3>
                    <p class="text-muted mb-4">Comienza creando tu primera lista de canales</p>
                    <button class="btn btn-primary btn-lg" data-bs-toggle="modal" data-bs-target="#createListModal">
                        <i class="bi bi-plus-circle me-2"></i>Crear Primera Lista
                    </button>
                </div>
            `;
            return;
        }
        
        // Filtrar y ordenar
        let filteredLists = filterAndSortLists();
        
        filteredLists.forEach(list => {
            const listCard = createListCard(list);
            container.appendChild(listCard);
        });
    }
    
    function filterAndSortLists() {
        let filtered = [...window.listsData];
        
        // Filtrar por búsqueda
        const searchInput = document.getElementById('searchLists');
        if (searchInput && searchInput.value) {
            const searchTerm = searchInput.value.toLowerCase();
            filtered = filtered.filter(list => 
                list.name.toLowerCase().includes(searchTerm) ||
                (list.description && list.description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Ordenar
        const sortSelect = document.getElementById('sortLists');
        if (sortSelect) {
            const sortBy = sortSelect.value;
            switch(sortBy) {
                case 'newest':
                    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    break;
                case 'oldest':
                    filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    break;
                case 'name_asc':
                    filtered.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'name_desc':
                    filtered.sort((a, b) => b.name.localeCompare(a.name));
                    break;
            }
        }
        
        return filtered;
    }
    
    function createListCard(list) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4 mb-4';
    
    // Usar channels_count en lugar de channels_aggregate
    const channelCount = list.channels_count || list.channels?.length || 0;
    const isPublic = list.is_public;
    
    col.innerHTML = `
        <div class="card h-100 hover-card border-0 border-top border-2 border-primary">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="d-flex flex-row align-items-center">
                            <div class="icon"> <i class="bi bi-collection-play-fill"></i> </div>
                            <div class="ms-2 c-details">
                                <h5 class="card-title text-primary text-break mb-0">${escapeHtml(list.name)}</h5> 
                                <span><i class="bi bi-calendar me-1"></i>${new Date(list.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <span class="badge ${isPublic ? 'bg-success' : 'bg-secondary'}">
                            ${isPublic ? 'Pública' : 'Privada'}
                        </span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <small class="text-muted">
                            <i class="bi bi-tv me-1"></i>
                            ${channelCount} canal${channelCount !== 1 ? 'es' : ''}
                        </small>
                        <small class="text-muted">
                            <i class="bi bi-arrow-clockwise me-1"></i>
                            ${tiempoDesdeFecha(list.updated_at)}
                        </small>
                    </div>
                    ${list.description ? `
                        <p class="card-text text-muted small mb-3">
                            ${escapeHtml(list.description)}
                        </p>
                    ` : ''}
                </div>
                <div class="card-footer bg-transparent border-top-0">
                    <div class="d-flex justify-content-between">
                        <a href="channels.html?list=${list.id}" class="btn btn-outline-primary border-0 border-bottom btn-sm">
                            <i class="bi bi-eye me-1"></i>Ver Canales
                        </a>
                        <div class="btn-group">
                            <button class="btn btn-outline-secondary btn-sm border-0 border-bottom edit-list" data-id="${list.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm border-0 border-bottom delete-list" data-id="${list.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
    `;
    
    return col;
}
    
    function setupEventListeners() {
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof logout === 'function') {
                    logout();
                }
            });
        }
        
        // Filtros
        const searchInput = document.getElementById('searchLists');
        if (searchInput) {
            searchInput.addEventListener('input', () => renderLists());
        }
        
        const sortSelect = document.getElementById('sortLists');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => renderLists());
        }
        
        // Modal crear lista
        const createForm = document.getElementById('createListForm');
        if (createForm) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await createList();
            });
        }
        
        // Eventos delegados para botones dinámicos
        document.addEventListener('click', async (e) => {
            // Editar lista
            if (e.target.closest('.edit-list')) {
                const listId = e.target.closest('.edit-list').dataset.id;
                await editList(listId);
            }
            
            // Eliminar lista
            if (e.target.closest('.delete-list')) {
                const listId = e.target.closest('.delete-list').dataset.id;
                confirmDeleteList(listId);
            }
        });
        
        // Eliminar lista confirmado
        const confirmDeleteBtn = document.getElementById('confirmDeleteList');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                const listId = document.getElementById('deleteListModal').dataset.listId;
                await deleteList(listId);
            });
        }
    }
    
    async function createList() {
        const form = document.getElementById('createListForm');
        const nameInput = document.getElementById('listName');
        const descriptionInput = document.getElementById('listDescription');
        const isPublicInput = document.getElementById('listIsPublic');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = document.getElementById('createListBtnText');
        const spinner = document.getElementById('createListSpinner');
        
        if (!nameInput || !nameInput.value.trim()) {
            showAlert('Por favor ingresa un nombre para la lista', 'warning');
            return;
        }
        
        // Verificar límite
        const user = await getCurrentUser();
        if (user) {
            const client = getSupabaseClient();
            const { count } = await client
                .from('lists')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);
            
            if (count >= 3) { // Límite gratuito
                showAlert('Has alcanzado el límite de 3 listas en tu plan actual', 'danger');
                return;
            }
        }
        
        // Deshabilitar botón
        submitBtn.disabled = true;
        if (btnText) btnText.textContent = 'Creando...';
        if (spinner) spinner.classList.remove('d-none');
        
        try {
            const client = getSupabaseClient();
            const user = await getCurrentUser();
            
            const listData = {
                name: nameInput.value.trim(),
                description: descriptionInput?.value.trim() || null,
                user_id: user.id,
                is_public: isPublicInput?.checked || false
            };
            
            const { data, error } = await client
                .from('lists')
                .insert([listData])
                .select()
                .single();
            
            if (error) throw error;
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('createListModal'));
            if (modal) modal.hide();
            
            // Limpiar formulario
            form.reset();
            
            // Recargar listas
            await loadLists();
            
            showAlert('Lista creada exitosamente', 'success');
            
        } catch (error) {
            console.error('Error creando lista:', error);
            showAlert('Error al crear la lista: ' + error.message, 'danger');
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            if (btnText) btnText.textContent = 'Crear Lista';
            if (spinner) spinner.classList.add('d-none');
        }
    }
    
    async function editList(listId) {
        const list = window.listsData.find(l => l.id === listId);
        if (!list) return;
        
        // Llenar formulario
        document.getElementById('editListId').value = list.id;
        document.getElementById('editListName').value = list.name;
        document.getElementById('editListDescription').value = list.description || '';
        document.getElementById('editListIsPublic').checked = list.is_public;
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('editListModal'));
        modal.show();
        
        // Configurar submit
        const form = document.getElementById('editListForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            await updateList(listId);
        };
    }
    
    async function updateList(listId) {
        const form = document.getElementById('editListForm');
        const nameInput = document.getElementById('editListName');
        const descriptionInput = document.getElementById('editListDescription');
        const isPublicInput = document.getElementById('editListIsPublic');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = document.getElementById('editListBtnText');
        const spinner = document.getElementById('editListSpinner');
        
        if (!nameInput.value.trim()) {
            showAlert('Por favor ingresa un nombre para la lista', 'warning');
            return;
        }
        
        // Deshabilitar botón
        submitBtn.disabled = true;
        if (btnText) btnText.textContent = 'Guardando...';
        if (spinner) spinner.classList.remove('d-none');
        
        try {
            const client = getSupabaseClient();
            
            const listData = {
                name: nameInput.value.trim(),
                description: descriptionInput?.value.trim() || null,
                is_public: isPublicInput?.checked || false,
                updated_at: new Date().toISOString()
            };
            
            const { error } = await client
                .from('lists')
                .update(listData)
                .eq('id', listId);
            
            if (error) throw error;
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editListModal'));
            if (modal) modal.hide();
            
            // Recargar listas
            await loadLists();
            
            showAlert('Lista actualizada exitosamente', 'success');
            
        } catch (error) {
            console.error('Error actualizando lista:', error);
            showAlert('Error al actualizar la lista', 'danger');
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            if (btnText) btnText.textContent = 'Guardar Cambios';
            if (spinner) spinner.classList.add('d-none');
        }
    }
    
    function confirmDeleteList(listId) {
        const list = window.listsData.find(l => l.id === listId);
        if (!list) return;
        
        document.getElementById('deleteListName').textContent = list.name;
        document.getElementById('deleteListModal').dataset.listId = listId;
        
        const modal = new bootstrap.Modal(document.getElementById('deleteListModal'));
        modal.show();
    }
    
    async function deleteList(listId) {
        const modalEl = document.getElementById('deleteListModal');
        const deleteBtn = document.getElementById('confirmDeleteList');
        const btnText = deleteBtn.querySelector('span:first-child');
        const spinner = document.getElementById('deleteListSpinner');
        
        // Deshabilitar botón
        deleteBtn.disabled = true;
        btnText.textContent = 'Eliminando...';
        if (spinner) spinner.classList.remove('d-none');
        
        try {
            const client = getSupabaseClient();
            
            const { error } = await client
                .from('lists')
                .delete()
                .eq('id', listId);
            
            if (error) throw error;
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            
            // Recargar listas
            await loadLists();
            
            showAlert('Lista eliminada exitosamente', 'success');
            
        } catch (error) {
            console.error('Error eliminando lista:', error);
            showAlert('Error al eliminar la lista', 'danger');
        } finally {
            // Restaurar botón
            deleteBtn.disabled = false;
            btnText.textContent = 'Eliminar Lista';
            if (spinner) spinner.classList.add('d-none');
        }
    }
    
    function updateUserInfo(user) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement && user) {
            userNameElement.textContent = user.user_metadata?.full_name || user.email;
        }
        
        // Actualizar información del plan
        updatePlanInfo(user?.id);
    }
    
    async function updatePlanInfo(userId) {
        if (!userId) return;
        
        const client = getSupabaseClient();
        if (!client) return;
        
        try {
            const { data: profile } = await client
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (profile) {
                const planBadge = document.getElementById('planBadge');
                const listProgress = document.getElementById('listProgress');
                const listUsage = document.getElementById('listUsage');
                
                if (planBadge && listProgress && listUsage) {
                    planBadge.textContent = profile.subscription_tier === 'free' ? 'Gratuito' : 'Premium';
                    planBadge.className = `badge ${profile.subscription_tier === 'free' ? 'bg-warning text-dark' : 'bg-success'}`;
                    
                    const { count } = await client
                        .from('lists')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', userId);
                    
                    const percentage = ((count || 0) / profile.lists_limit) * 100;
                    listProgress.style.width = `${Math.min(percentage, 100)}%`;
                    listUsage.textContent = `${count || 0} de ${profile.lists_limit} listas utilizadas`;
                }
            }
        } catch (error) {
            console.warn('Error actualizando info del plan:', error);
        }
    }





    function tiempoDesdeFecha(fechaString) {
        // 1. Crear un objeto Date para la fecha de referencia
        const fechaReferencia = new Date(fechaString); // Ejemplo: '2025-12-03'
        
        // 2. Obtener la fecha actual
        const fechaActual = new Date();

        // 3. Calcular la diferencia en milisegundos
        const diferenciaMs = fechaActual.getTime() - fechaReferencia.getTime();

        // 4. Convertir milisegundos a días
        const diasPasados = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));

        // 5. Formatear el resultado
        if (diasPasados < 0) {
            return "Fecha futura"; // O manejar como prefieras
        } else if (diasPasados === 0) {
            return "Hoy"; // Si la fecha es hoy
        } else if (diasPasados === 1) {
            return "Hace 1 día";
        } else {
            return `Hace ${diasPasados} días`;
        }
    }


});
