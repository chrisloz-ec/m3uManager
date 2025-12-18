// dashboard.js - VERSIÓN CORREGIDA
document.addEventListener('DOMContentLoaded', async function() {
    console.log('=== DASHBOARD.JS INICIADO ===');
    
    // Verificar autenticación
    if (typeof requireAuth === 'function') {
        await requireAuth();
    } else {
        console.error('requireAuth no disponible');
        window.location.href = 'login.html';
        return;
    }
    
    // Obtener elementos del DOM
    const logoutBtn = document.getElementById('logoutBtn');
    const userName = document.getElementById('userName');
    
    // Cargar datos
    await loadUserData();
    await loadStatistics();
    await loadRecentLists();
    await loadRecentActivity();
    
    // Evento logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof logout === 'function') {
                logout();
            }
        });
    }
    
    async function loadUserData() {
        try {
            console.log('Cargando datos del usuario...');
            
            // Obtener usuario actual
            const user = await getCurrentUser();
            if (user && userName) {
                userName.textContent = user.user_metadata?.full_name || user.email;
            }
            
            // Obtener cliente Supabase
            const client = getSupabaseClient();
            if (!client) {
                console.error('Cliente Supabase no disponible');
                return;
            }
            
            // Cargar perfil del usuario
            if (user) {
                const { data: profile, error } = await client
                    .from('user_profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (!error && profile) {
                    // Actualizar información del plan en sidebar
                    updatePlanInfo(profile, user.id);
                }
            }
        } catch (error) {
            console.error('Error cargando datos del usuario:', error);
        }
    }
    
    async function loadStatistics() {
        try {
            console.log('Cargando estadísticas...');
            
            const client = getSupabaseClient();
            if (!client) return;
            
            const user = await getCurrentUser();
            if (!user) return;
            
            // Obtener todas las listas del usuario
            const { data: lists, error: listsError } = await client
                .from('lists')
                .select('id')
                .eq('user_id', user.id);
            
            if (listsError) throw listsError;
            
            // Actualizar elementos del DOM
            const totalLists = document.getElementById('totalLists');
            const activeChannels = document.getElementById('activeChannels');
            const inactiveChannels = document.getElementById('inactiveChannels');
            const totalExports = document.getElementById('totalExports');
            
            if (lists && lists.length > 0) {
                const listIds = lists.map(list => list.id);
                
                // Contar canales por estado
                const { data: channels, error: channelsError } = await client
                    .from('channels')
                    .select('status')
                    .in('list_id', listIds);
                
                if (!channelsError && channels) {
                    const active = channels.filter(c => c.status === 'active').length;
                    const inactive = channels.filter(c => c.status === 'inactive').length;
                    
                    // Actualizar estadísticas
                    if (totalLists) totalLists.textContent = lists.length;
                    if (activeChannels) activeChannels.textContent = active;
                    if (inactiveChannels) inactiveChannels.textContent = inactive;
                    
                    // Contar exportaciones (simulado)
                    if (totalExports) totalExports.textContent = lists.length;
                }
            } else {
                if (totalLists) totalLists.textContent = '0';
                if (activeChannels) activeChannels.textContent = '0';
                if (inactiveChannels) inactiveChannels.textContent = '0';
                if (totalExports) totalExports.textContent = '0';
            }
        } catch (error) {
            console.error('Error cargando estadísticas:', error);
        }
    }
    
    async function loadRecentLists() {
        try {
            console.log('Cargando listas recientes...');
            
            const client = getSupabaseClient();
            if (!client) return;
            
            const user = await getCurrentUser();
            if (!user) return;
            
            // Obtener listas recientes
            const { data: lists, error } = await client
                .from('lists')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (error) throw error;
            
            const tbody = document.getElementById('recentListsTable')?.querySelector('tbody');
            const noListsMessage = document.getElementById('noListsMessage');
            
            if (!tbody) return;
            
            tbody.innerHTML = '';
            
            if (lists && lists.length > 0) {
                if (noListsMessage) noListsMessage.classList.add('d-none');
                
                for (const list of lists) {
                    // Contar canales de esta lista
                    const { count: totalChannels, error: countError } = await client
                        .from('channels')
                        .select('*', { count: 'exact', head: true })
                        .eq('list_id', list.id);
                    
                    const { count: activeChannels } = await client
                        .from('channels')
                        .select('*', { count: 'exact', head: true })
                        .eq('list_id', list.id)
                        .eq('status', 'active');
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <strong>${escapeHtml(list.name)}</strong>
                            
                        </td>
                        <td>
                            <span class="badge ${activeChannels === totalChannels ? 'bg-success' : 'bg-warning'}">
                                ${activeChannels || 0}/${totalChannels || 0} activos
                            </span>
                        </td>
                        <td>
                            <span class="badge ${activeChannels === totalChannels ? 'bg-success' : 
                                            activeChannels > 0 ? 'bg-warning' : 'bg-danger'}">
                                ${activeChannels === totalChannels ? 'Óptimo' : 
                                 activeChannels > 0 ? 'Parcial' : 'Crítico'}
                            </span>
                        </td>
                        <td class="small">${new Date(list.updated_at).toLocaleDateString()}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <a href="channels.html?list=${list.id}" class="btn btn-outline-primary">
                                    <i class="bi bi-eye"></i>
                                </a>
                                <a href="channels.html?list=${list.id}" class="btn btn-outline-secondary">
                                    <i class="bi bi-pencil"></i>
                                </a>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(row);
                }
            } else {
                if (noListsMessage) noListsMessage.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Error cargando listas recientes:', error);
        }
    }
    
    async function loadRecentActivity() {
        try {
            console.log('Cargando actividad reciente...');
            
            const client = getSupabaseClient();
            if (!client) return;
            
            const user = await getCurrentUser();
            if (!user) return;
            
            const activities = [];
            const timeline = document.getElementById('activityTimeline');
            const noActivityMessage = document.getElementById('noActivityMessage');
            
            if (!timeline) return;
            
            timeline.innerHTML = '';
            
            // Obtener actividad reciente
            const { data: recentLists } = await client
                .from('lists')
                .select('name, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(3);
            
            if (recentLists) {
                recentLists.forEach(list => {
                    activities.push({
                        message: `Lista "${list.name}" creada`,
                        time: list.created_at,
                        icon: 'list-ul',
                        color: 'primary'
                    });
                });
            }
            
            // Mostrar actividades
            if (activities.length > 0) {
                if (noActivityMessage) noActivityMessage.classList.add('d-none');
                
                activities.slice(0, 5).forEach(activity => {
                    const activityItem = document.createElement('div');
                    activityItem.className = 'activity-item d-flex mb-3';
                    activityItem.innerHTML = `
                        <div class="flex-shrink-0">
                            <div class="rounded-circle bg-${activity.color} bg-opacity-10 text-${activity.color} p-2">
                                <i class="bi bi-${activity.icon}"></i>
                            </div>
                        </div>
                        <div class="flex-grow-1 ms-3">
                            <p class="mb-1">${activity.message}</p>
                            <small class="text-muted">${formatTimeAgo(new Date(activity.time))}</small>
                        </div>
                    `;
                    timeline.appendChild(activityItem);
                });
            } else {
                if (noActivityMessage) noActivityMessage.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Error cargando actividad reciente:', error);
        }
    }
    
    function updatePlanInfo(profile, userId) {
        const planBadge = document.getElementById('planBadge');
        const listProgress = document.getElementById('listProgress');
        const listUsage = document.getElementById('listUsage');
        
        if (planBadge && listProgress && listUsage && profile) {
            planBadge.textContent = profile.subscription_tier === 'free' ? 'Gratuito' : 'Premium';
            planBadge.className = `badge ${profile.subscription_tier === 'free' ? 'bg-warning text-dark' : 'bg-success'}`;
            
            // Contar listas actuales
            countUserLists(userId).then(count => {
                const percentage = (count / profile.lists_limit) * 100;
                listProgress.style.width = `${Math.min(percentage, 100)}%`;
                listUsage.textContent = `${count} de ${profile.lists_limit} listas utilizadas`;
            });
        }
    }
    
    async function countUserLists(userId) {
        try {
            const client = getSupabaseClient();
            if (!client) return 0;
            
            const { count, error } = await client
                .from('lists')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
            
            return error ? 0 : (count || 0);
        } catch (error) {
            return 0;
        }
    }
    
    function getSupabaseClient() {
        // Intentar diferentes formas de obtener el cliente
        if (typeof getSupabase === 'function') {
            return getSupabase();
        } else if (window.supabaseClient) {
            return window.supabaseClient;
        } else if (window.supabase && window.supabaseClient) {
            return window.supabaseClient;
        }
        
        console.error('No se pudo obtener el cliente Supabase');
        return null;
    }
    
    function formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Hace un momento';
        if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
        if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
        if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
        
        return date.toLocaleDateString();
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});