// Depuración inicial
console.log('=== RESET PASSWORD DEBUG ===');
console.log('URL completa:', window.location.href);
console.log('Hash:', window.location.hash);

// Verificar si auth.js está cargado
if (typeof getSupabaseClient !== 'function') {
    console.error('ERROR: getSupabaseClient no está definido');
    console.error('Asegúrate de cargar auth.js antes de reset-password.js');
}


// reset-password.js - Todo en un solo archivo
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Reset password page loaded');
    
    // Referencias a elementos
    const form = document.getElementById('resetPasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    const verificationStatus = document.getElementById('verificationStatus');
    const errorState = document.getElementById('errorState');
    
    // Verificar que existe el formulario
    if (!form) {
        console.error('Formulario no encontrado');
        return;
    }
    
    // Obtener cliente Supabase
    const client = getSupabaseClient();
    if (!client) {
        showAlert('Error de conexión con la base de datos', 'danger');
        return;
    }
    
    // Obtener parámetros de la URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type');
    
    console.log('Parámetros URL:', { 
        hasToken: !!access_token, 
        tokenLength: access_token ? access_token.length : 0,
        type: type 
    });
    
    // Si no hay token o no es de tipo recovery, mostrar error
    if (!access_token || type !== 'recovery') {
        console.error('Token no encontrado o tipo incorrecto');
        showErrorState();
        return;
    }
    
    // Paso 1: Verificar el token y establecer sesión
    try {
        console.log('Verificando token...');
        
        // Método 1: Usar verifyOtp (recomendado para recovery)
        const { data: verifyData, error: verifyError } = await client.auth.verifyOtp({
            token_hash: access_token,
            type: 'recovery'
        });
        
        if (verifyError) {
            console.error('Error verifyOtp:', verifyError);
            throw verifyError;
        }
        
        console.log('Token verificado exitosamente:', verifyData);
        
        // Obtener la sesión actual
        const { data: { session } } = await client.auth.getSession();
        
        if (!session) {
            console.log('No hay sesión activa, estableciendo sesión...');
            
            // Establecer sesión con los tokens
            const { data: setSessionData, error: setSessionError } = await client.auth.setSession({
                access_token,
                refresh_token
            });
            
            if (setSessionError) {
                console.error('Error estableciendo sesión:', setSessionError);
                throw setSessionError;
            }
            
            console.log('Sesión establecida:', setSessionData);
        }
        
        // Ocultar estado de verificación y mostrar formulario
        if (verificationStatus) {
            verificationStatus.classList.add('d-none');
        }
        form.classList.remove('d-none');
        
        // Mostrar mensaje de éxito
        showAlert('¡Enlace verificado! Ahora puedes establecer tu nueva contraseña.', 'success');
        
    } catch (error) {
        console.error('Error en verificación:', error);
        showErrorState();
        return;
    }
    
    // Paso 2: Configurar validaciones del formulario
    function validatePasswords() {
        const password = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        // Remover estados previos
        confirmPasswordInput.classList.remove('is-valid', 'is-invalid');
        
        if (!password || !confirmPassword) {
            return false;
        }
        
        if (password !== confirmPassword) {
            confirmPasswordInput.classList.add('is-invalid');
            return false;
        } else {
            confirmPasswordInput.classList.add('is-valid');
            return true;
        }
    }
    
    function validatePasswordStrength(password) {
        if (password.length < 6) {
            return { valid: false, message: 'Mínimo 6 caracteres' };
        }
        
        // Validaciones adicionales opcionales
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        
        let strength = 0;
        if (password.length >= 8) strength++;
        if (hasUpperCase && hasLowerCase) strength++;
        if (hasNumbers) strength++;
        
        return { 
            valid: true, 
            strength: strength,
            message: strength >= 2 ? 'Contraseña segura' : 'Contraseña débil'
        };
    }
    
    // Event listeners para validación en tiempo real
    newPasswordInput.addEventListener('input', function() {
        const validation = validatePasswordStrength(this.value);
        
        // Actualizar UI de fortaleza
        const strengthBar = document.getElementById('passwordStrength');
        if (strengthBar) {
            strengthBar.className = 'password-strength';
            if (this.value.length > 0) {
                strengthBar.classList.add(`strength-${Math.min(validation.strength || 0, 3)}`);
            }
        }
        
        // Validar coincidencia
        validatePasswords();
    });
    
    confirmPasswordInput.addEventListener('input', validatePasswords);
    
    // Paso 3: Manejar envío del formulario
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const password = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        // Validaciones
        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.valid) {
            showAlert(passwordValidation.message, 'warning');
            newPasswordInput.focus();
            return;
        }
        
        if (!validatePasswords()) {
            showAlert('Las contraseñas no coinciden', 'warning');
            confirmPasswordInput.focus();
            return;
        }
        
        // Deshabilitar botón y mostrar spinner
        if (submitBtn) {
            submitBtn.disabled = true;
            const originalText = submitBtn.querySelector('#resetBtnText');
            const spinner = submitBtn.querySelector('#resetSpinner');
            
            if (originalText) originalText.textContent = 'Actualizando...';
            if (spinner) spinner.classList.remove('d-none');
        }
        
        try {
            console.log('Actualizando contraseña...');
            
            // Actualizar contraseña
            const { data, error } = await client.auth.updateUser({
                password: password
            });
            
            if (error) {
                console.error('Error updateUser:', error);
                throw error;
            }
            
            console.log('Contraseña actualizada exitosamente:', data);
            
            // Mostrar éxito
            showAlert('¡Contraseña actualizada correctamente! Redirigiendo...', 'success');
            
            // Opcional: Cerrar sesión para forzar nuevo login
            setTimeout(async () => {
                await client.auth.signOut();
                window.location.href = 'login.html?message=password_reset_success';
            }, 2000);
            
        } catch (error) {
            console.error('Error actualizando contraseña:', error);
            
            let errorMessage = 'Error al actualizar la contraseña';
            
            if (error.message.includes('session') || error.message.includes('AuthSessionMissingError')) {
                errorMessage = 'La sesión ha expirado. Por favor solicita un nuevo enlace.';
                
                // Redirigir después de 3 segundos
                setTimeout(() => {
                    window.location.href = 'forgot-password.html';
                }, 3000);
            } else if (error.message.includes('weak')) {
                errorMessage = 'La contraseña es muy débil. Usa una contraseña más segura.';
            } else if (error.message.includes('expired') || error.message.includes('invalid')) {
                errorMessage = 'El enlace ha expirado. Solicita uno nuevo.';
                showErrorState();
            }
            
            showAlert(errorMessage, 'danger');
            
        } finally {
            // Restaurar botón
            if (submitBtn) {
                submitBtn.disabled = false;
                const originalText = submitBtn.querySelector('#resetBtnText');
                const spinner = submitBtn.querySelector('#resetSpinner');
                
                if (originalText) originalText.textContent = 'Restablecer Contraseña';
                if (spinner) spinner.classList.add('d-none');
            }
        }
    });
    
    // Funciones auxiliares
    function showErrorState() {
        if (verificationStatus) verificationStatus.classList.add('d-none');
        if (errorState) errorState.classList.remove('d-none');
        if (form) form.classList.add('d-none');
        
        showAlert('El enlace ha expirado o es inválido. Por favor solicita uno nuevo.', 'danger');
    }
    
    function showAlert(message, type) {
        // Buscar o crear contenedor de alertas
        let alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'alertContainer';
            alertContainer.className = 'mt-3';
            
            const cardBody = document.querySelector('.card-body');
            if (cardBody) {
                cardBody.appendChild(alertContainer);
            }
        }
        
        // Crear alerta
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Limpiar alertas previas y agregar nueva
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alertDiv);
        
        // Auto-eliminar después de 5 segundos (excepto success)
        if (type !== 'success') {
            setTimeout(() => {
                if (alertDiv.parentElement) {
                    const bsAlert = new bootstrap.Alert(alertDiv);
                    bsAlert.close();
                }
            }, 5000);
        }
    }
    
    // Inicialización adicional
    function initPasswordStrengthIndicator() {
        const passwordInput = document.getElementById('newPassword');
        const strengthDiv = document.getElementById('passwordStrength');
        
        if (!passwordInput || !strengthDiv) return;
        
        passwordInput.addEventListener('input', function() {
            const password = this.value;
            
            if (!password) {
                strengthDiv.style.width = '0%';
                strengthDiv.style.backgroundColor = '';
                return;
            }
            
            // Calcular fortaleza
            let strength = 0;
            if (password.length >= 6) strength++;
            if (password.length >= 8) strength++;
            if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
            if (/\d/.test(password)) strength++;
            if (/[^A-Za-z0-9]/.test(password)) strength++;
            
            // Actualizar barra
            const width = Math.min(strength * 20, 100);
            let color = '#dc3545'; // Rojo
            
            if (strength >= 3) color = '#ffc107'; // Amarillo
            if (strength >= 4) color = '#28a745'; // Verde
            
            strengthDiv.style.width = `${width}%`;
            strengthDiv.style.backgroundColor = color;
        });
    }
    
    // Inicializar indicador de fortaleza
    initPasswordStrengthIndicator();
    
    // Verificar inmediatamente si no hay token
    if (!access_token) {
        showErrorState();
    }
});