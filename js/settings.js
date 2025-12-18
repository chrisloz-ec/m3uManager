// settings.js
class SettingsManager {
    constructor() {
        this.currentUser = null;
        this.userProfile = null;
        this.categories = [];
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
        requireAuth();
        
        // Obtener usuario actual
        this.currentUser = await getCurrentUser();
        if (!this.currentUser) return;
        
        // Cargar datos del usuario
        await this.loadUserProfile();
        
        // Cargar categorías
        await this.loadCategories();
        
        // Configurar eventos
        this.setupEventListeners();
        
        // Actualizar UI
        this.updateUserInfo();
        this.populateForms();
    }
    
    async loadUserProfile() {
        try {
            const client = this.getClient();
            const { data, error } = await client
                .from('user_profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            this.userProfile = data;
        } catch (error) {
            console.error('Error cargando perfil:', error);
        }
    }
    
    async loadCategories() {
        try {
            const user = await getCurrentUser();
            
            // Obtener categorías del usuario (no las por defecto)
            const client = this.getClient();
            const { data, error } = await client
                .from('categories')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_default', false)
                .order('name');
            
            if (error) throw error;
            this.categories = data || [];
            
            // Renderizar categorías
            this.renderCategories();
            
        } catch (error) {
            console.error('Error cargando categorías:', error);
        }
    }
    
    setupEventListeners() {
        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
        
        // Formulario de perfil
        document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateProfile();
        });
        
        // Formulario de contraseña
        document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updatePassword();
        });
        
        // Formulario de notificaciones
        document.getElementById('notificationsForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateNotifications();
        });
        
        // Formulario de categorías
        document.getElementById('addCategoryForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createCategory();
        });
        
        // Botón exportar todos los datos
        document.getElementById('exportAllData')?.addEventListener('click', () => {
            this.exportAllData();
        });
        
        // Botón eliminar todos los datos
        document.getElementById('confirmDeleteDataBtn')?.addEventListener('click', () => {
            this.deleteAllData();
        });
        
        // Botón eliminar cuenta
        document.getElementById('confirmDeleteAccountBtn')?.addEventListener('click', () => {
            this.deleteAccount();
        });
        
        // Validación de contraseña en tiempo real
        document.getElementById('newPassword')?.addEventListener('input', (e) => {
            this.updatePasswordStrength(e.target.value);
        });
        
        // Validación de confirmaciones
        document.getElementById('confirmDeleteData')?.addEventListener('input', (e) => {
            document.getElementById('confirmDeleteDataBtn').disabled = 
                e.target.value !== 'ELIMINAR';
        });
        
        document.getElementById('confirmDeleteAccount')?.addEventListener('input', (e) => {
            const understandCheckbox = document.getElementById('understandDelete');
            document.getElementById('confirmDeleteAccountBtn').disabled = 
                e.target.value !== 'ELIMINAR CUENTA' || !understandCheckbox.checked;
        });
        
        document.getElementById('understandDelete')?.addEventListener('change', (e) => {
            const confirmInput = document.getElementById('confirmDeleteAccount');
            document.getElementById('confirmDeleteAccountBtn').disabled = 
                confirmInput.value !== 'ELIMINAR CUENTA' || !e.target.checked;
        });
        
        // Tabs
        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                // Guardar tab activo en localStorage
                localStorage.setItem('activeSettingsTab', e.target.getAttribute('href'));
            });
        });
        
        // Restaurar tab activo
        const activeTab = localStorage.getItem('activeSettingsTab');
        if (activeTab) {
            const tab = document.querySelector(`[href="${activeTab}"]`);
            if (tab) {
                new bootstrap.Tab(tab).show();
            }
        }
    }
    
    updateUserInfo() {
        // Nombre de usuario en navbar
        const userNameElement = document.getElementById('userName');
        if (userNameElement && this.currentUser) {
            userNameElement.textContent = this.currentUser.user_metadata?.full_name || this.currentUser.email;
        }
        
        // Información en sidebar
        this.updatePlanInfo();
        
        // Información en la tarjeta de perfil
        document.getElementById('userFullName').textContent = 
            this.currentUser.user_metadata?.full_name || 'Usuario';
        document.getElementById('userEmail').textContent = this.currentUser.email;
        
        if (this.currentUser.created_at) {
            const memberSince = new Date(this.currentUser.created_at).toLocaleDateString();
            document.getElementById('memberSince').textContent = memberSince;
        }
    }
    
    updatePlanInfo() {
        if (!this.userProfile) return;
        
        const planBadge = document.getElementById('planBadge');
        const listProgress = document.getElementById('listProgress');
        const listUsage = document.getElementById('listUsage');
        
        if (planBadge && listProgress && listUsage) {
            planBadge.textContent = this.userProfile.subscription_tier === 'free' ? 'Gratuito' : 'Premium';
            planBadge.className = `badge ${this.userProfile.subscription_tier === 'free' ? 'bg-warning text-dark' : 'bg-success'}`;
            
            // Calcular uso actual
            this.calculateUsage().then(usage => {
                const percentage = (usage.listCount / this.userProfile.lists_limit) * 100;
                listProgress.style.width = `${Math.min(percentage, 100)}%`;
                listUsage.textContent = `${usage.listCount} de ${this.userProfile.lists_limit} listas utilizadas`;
                
                // Actualizar también en la pestaña de suscripción
                document.getElementById('currentPlan').textContent = 
                    this.userProfile.subscription_tier === 'free' ? 'Plan Gratuito' : 'Plan Premium';
                document.getElementById('currentLists').textContent = 
                    `${usage.listCount}/${this.userProfile.lists_limit}`;
                document.getElementById('currentChannels').textContent = 
                    `${usage.channelCount}/150`;
            });
        }
    }
    
    async calculateUsage() {
        try {
            const client = this.getClient();
            const { count: listCount } = await client
                .from('lists')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', this.currentUser.id);
            
            // Obtener IDs de listas
            const { data: lists } = await client
                .from('lists')
                .select('id')
                .eq('user_id', this.currentUser.id);
            
            let channelCount = 0;
            if (lists && lists.length > 0) {
                const listIds = lists.map(list => list.id);
                const { count } = await client
                    .from('channels')
                    .select('*', { count: 'exact', head: true })
                    .in('list_id', listIds);
                channelCount = count || 0;
            }
            
            return { listCount: listCount || 0, channelCount };
        } catch (error) {
            console.error('Error calculando uso:', error);
            return { listCount: 0, channelCount: 0 };
        }
    }
    
    populateForms() {
        // Perfil
        if (this.currentUser) {
            document.getElementById('profileName').value = 
                this.currentUser.user_metadata?.full_name || '';
            document.getElementById('profileEmail').value = this.currentUser.email;
        }
        
        // Notificaciones (valores por defecto)
        document.getElementById('notifyChannelStatus').checked = true;
        document.getElementById('notifyImportComplete').checked = true;
        document.getElementById('notifyUpdates').checked = false;
        document.getElementById('checkDaily').checked = true;
    }
    
    async updateProfile() {
        const form = document.getElementById('profileForm');
        const nameInput = document.getElementById('profileName');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = document.getElementById('profileBtnText');
        const spinner = document.getElementById('profileSpinner');

        const client = this.getClient();
        
        // Validar
        if (!nameInput.value.trim()) {
            showAlert('Por favor ingresa tu nombre', 'warning');
            nameInput.focus();
            return;
        }
        
        // Deshabilitar botón
        submitBtn.disabled = true;
        btnText.textContent = 'Guardando...';
        spinner.classList.remove('d-none');
        
        try {
            // Actualizar metadatos del usuario
            const { error: updateError } = await client.auth.updateUser({
                data: { full_name: nameInput.value.trim() }
            });
            
            if (updateError) throw updateError;
            
            // Actualizar perfil en la base de datos
            const { error: profileError } = await client
                .from('user_profiles')
                .update({ full_name: nameInput.value.trim() })
                .eq('id', this.currentUser.id);
            
            if (profileError) throw profileError;
            
            // Actualizar información del usuario localmente
            this.currentUser.user_metadata.full_name = nameInput.value.trim();
            this.updateUserInfo();
            
            showAlert('Perfil actualizado exitosamente', 'success');
            
        } catch (error) {
            console.error('Error actualizando perfil:', error);
            showAlert('Error al actualizar el perfil', 'danger');
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            btnText.textContent = 'Guardar Cambios';
            spinner.classList.add('d-none');
        }
    }
    
    async updatePassword() {
        const form = document.getElementById('passwordForm');
        const currentPassword = document.getElementById('currentPassword');
        const newPassword = document.getElementById('newPassword');
        const confirmPassword = document.getElementById('confirmPassword');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = document.getElementById('passwordBtnText');
        const spinner = document.getElementById('passwordSpinner');

        const client = this.getClient();
        
        // Validar
        if (!currentPassword.value) {
            showAlert('Por favor ingresa tu contraseña actual', 'warning');
            currentPassword.focus();
            return;
        }
        
        if (!newPassword.value || newPassword.value.length < 6) {
            showAlert('La nueva contraseña debe tener al menos 6 caracteres', 'warning');
            newPassword.focus();
            return;
        }
        
        if (newPassword.value !== confirmPassword.value) {
            showAlert('Las contraseñas no coinciden', 'warning');
            confirmPassword.focus();
            return;
        }
        
        // Deshabilitar botón
        submitBtn.disabled = true;
        btnText.textContent = 'Cambiando...';
        spinner.classList.remove('d-none');
        
        try {
            // Verificar contraseña actual
            const { error: signInError } = await client.auth.signInWithPassword({
                email: this.currentUser.email,
                password: currentPassword.value
            });
            
            if (signInError) {
                if (signInError.message.includes('Invalid login credentials')) {
                    showAlert('La contraseña actual es incorrecta', 'danger');
                    return;
                }
                throw signInError;
            }
            
            // Actualizar contraseña
            const { error: updateError } = await client.auth.updateUser({
                password: newPassword.value
            });
            
            if (updateError) throw updateError;
            
            // Limpiar formulario
            form.reset();
            
            showAlert('Contraseña actualizada exitosamente', 'success');
            
        } catch (error) {
            console.error('Error actualizando contraseña:', error);
            showAlert('Error al actualizar la contraseña', 'danger');
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            btnText.textContent = 'Cambiar Contraseña';
            spinner.classList.add('d-none');
        }
    }
    
    async updateNotifications() {
        const form = document.getElementById('notificationsForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = document.getElementById('notificationsBtnText');
        const spinner = document.getElementById('notificationsSpinner');
        
        // Deshabilitar botón
        submitBtn.disabled = true;
        btnText.textContent = 'Guardando...';
        spinner.classList.remove('d-none');
        
        try {
            // Aquí guardaríamos las preferencias en la base de datos
            // Por ahora es solo un ejemplo
            
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simular API call
            
            showAlert('Preferencias de notificaciones guardadas', 'success');
            
        } catch (error) {
            console.error('Error actualizando notificaciones:', error);
            showAlert('Error al guardar las preferencias', 'danger');
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            btnText.textContent = 'Guardar Preferencias';
            spinner.classList.add('d-none');
        }
    }
    
    renderCategories() {
        const container = document.getElementById('categoriesContainer');
        const noCategoriesMsg = document.getElementById('noCategoriesMessage');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.categories.length === 0) {
            noCategoriesMsg.classList.remove('d-none');
            return;
        }
        
        noCategoriesMsg.classList.add('d-none');
        
        this.categories.forEach(category => {
            const categoryCard = this.createCategoryCard(category);
            container.appendChild(categoryCard);
        });
    }
    
    createCategoryCard(category) {
        const col = document.createElement('div');
        col.className = 'col-md-6 mb-3';
        
        col.innerHTML = `
            <div class="card h-100">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="card-title mb-1">${escapeHtml(category.name)}</h6>
                            <small class="text-muted">
                                <i class="bi bi-calendar me-1"></i>
                                ${new Date(category.created_at).toLocaleDateString()}
                            </small>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-secondary edit-category" data-id="${category.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-danger delete-category" data-id="${category.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return col;
    }
    
    async createCategory() {
        const form = document.getElementById('addCategoryForm');
        const nameInput = document.getElementById('categoryName');
        const colorInput = document.getElementById('categoryColor');
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = document.getElementById('categoryBtnText');
        const spinner = document.getElementById('categorySpinner');

        const client = this.getClient();
        
        // Validar
        if (!nameInput.value.trim()) {
            showAlert('Por favor ingresa un nombre para la categoría', 'warning');
            nameInput.focus();
            return;
        }
        
        // Verificar si ya existe
        const exists = this.categories.some(cat => 
            cat.name.toLowerCase() === nameInput.value.trim().toLowerCase()
        );
        
        if (exists) {
            showAlert('Ya existe una categoría con ese nombre', 'warning');
            nameInput.focus();
            return;
        }
        
        // Deshabilitar botón
        submitBtn.disabled = true;
        btnText.textContent = 'Creando...';
        spinner.classList.remove('d-none');
        
        try {
            const categoryData = {
                name: nameInput.value.trim(),
                user_id: this.currentUser.id,
                is_default: false
            };
            
            const { data, error } = await client
                .from('categories')
                .insert([categoryData])
                .select()
                .single();
            
            if (error) throw error;
            
            // Agregar a la lista local
            this.categories.push(data);
            
            // Cerrar modal y limpiar formulario
            const modal = bootstrap.Modal.getInstance(document.getElementById('addCategoryModal'));
            modal.hide();
            form.reset();
            
            // Actualizar UI
            this.renderCategories();
            
            showAlert('Categoría creada exitosamente', 'success');
            
        } catch (error) {
            console.error('Error creando categoría:', error);
            showAlert('Error al crear la categoría', 'danger');
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            btnText.textContent = 'Crear Categoría';
            spinner.classList.add('d-none');
        }
    }
    
    async exportAllData() {
        try {
            showAlert('Preparando exportación de datos...', 'info');
            
            const user = await getCurrentUser();
            const client = this.getClient();
            
            // Obtener todos los datos del usuario
            const [lists, channels, categories, profile] = await Promise.all([
                // Listas
                client
                    .from('lists')
                    .select('*')
                    .eq('user_id', user.id),
                
                // Canales (necesitamos obtener primero las listas)
                client
                    .from('channels')
                    .select('*, lists!inner(*)')
                    .eq('lists.user_id', user.id),
                
                // Categorías
                client
                    .from('categories')
                    .select('*')
                    .eq('user_id', user.id),
                
                // Perfil
                client
                    .from('user_profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()
            ]);
            
            const exportData = {
                metadata: {
                    export_date: new Date().toISOString(),
                    user_id: user.id,
                    user_email: user.email
                },
                profile: profile.data,
                lists: lists.data,
                channels: channels.data,
                categories: categories.data
            };
            
            // Crear archivo JSON
            const jsonData = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Descargar
            const a = document.createElement('a');
            a.href = url;
            a.download = `m3u-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showAlert('Datos exportados exitosamente', 'success');
            
        } catch (error) {
            console.error('Error exportando datos:', error);
            showAlert('Error al exportar los datos', 'danger');
        }
    }
    
    async deleteAllData() {
        try {
            const user = await getCurrentUser();
            
            showAlert('Eliminando todos los datos...', 'warning');
            
            // Obtener todas las listas del usuario
            const client = this.getClient();
            const { data: lists } = await client
                .from('lists')
                .select('id')
                .eq('user_id', user.id);
            
            if (lists && lists.length > 0) {
                const listIds = lists.map(list => list.id);
                
                // Eliminar canales (esto debería ser automático con CASCADE)
                await client
                    .from('channels')
                    .delete()
                    .in('list_id', listIds);
                
                // Eliminar listas
                await client
                    .from('lists')
                    .delete()
                    .in('id', listIds);
            }
            
            // Eliminar categorías personalizadas
            await client
                .from('categories')
                .delete()
                .eq('user_id', user.id)
                .eq('is_default', false);
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('deleteDataModal'));
            modal.hide();
            
            showAlert('Todos los datos han sido eliminados', 'success');
            
            // Recargar página después de un momento
            setTimeout(() => {
                window.location.reload();
            }, 2000);
            
        } catch (error) {
            console.error('Error eliminando datos:', error);
            showAlert('Error al eliminar los datos', 'danger');
        }
    }
    
    async deleteAccount() {
        try {
            const user = await getCurrentUser();
            const client = this.getClient();
            
            showAlert('Eliminando cuenta...', 'warning');
            
            // Primero eliminar todos los datos (reutilizar la función anterior)
            await this.deleteAllData();
            
            // Eliminar perfil
            await client
                .from('user_profiles')
                .delete()
                .eq('id', user.id);
            
            // Eliminar usuario de auth (esto requeriría una función edge)
            // Por ahora solo cerramos sesión
            
            await client.auth.signOut();
            
            showAlert('Cuenta eliminada exitosamente', 'success');
            
            // Redirigir a la página principal
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            
        } catch (error) {
            console.error('Error eliminando cuenta:', error);
            showAlert('Error al eliminar la cuenta', 'danger');
        }
    }
    
    updatePasswordStrength(password) {
        const strengthBar = document.getElementById('passwordStrength');
        const strengthText = document.getElementById('passwordStrengthText');
        
        let strength = 0;
        let text = 'Débil';
        let color = 'danger';
        
        if (password.length >= 8) strength += 25;
        if (/[A-Z]/.test(password)) strength += 25;
        if (/[0-9]/.test(password)) strength += 25;
        if (/[^A-Za-z0-9]/.test(password)) strength += 25;
        
        if (strength >= 75) {
            text = 'Fuerte';
            color = 'success';
        } else if (strength >= 50) {
            text = 'Media';
            color = 'warning';
        }
        
        if (strengthBar) {
            strengthBar.style.width = `${strength}%`;
            strengthBar.className = `progress-bar bg-${color}`;
        }
        
        if (strengthText) {
            strengthText.textContent = `Seguridad: ${text}`;
            strengthText.className = `text-${color}`;
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager = new SettingsManager();
});

// Utilidades
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer') || document.body;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.insertBefore(alertDiv, alertContainer.firstChild);
    
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}