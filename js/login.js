// login.js - VERSIÓN SIMPLE
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== LOGIN.JS INICIADO ===');
    
    // Redirigir si ya está autenticado
    if (typeof redirectIfAuthenticated === 'function') {
        redirectIfAuthenticated();
    }
    
    const form = document.getElementById('loginForm');
    if (!form) {
        console.error('Formulario no encontrado');
        return;
    }
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const submitBtn = this.querySelector('button[type="submit"]');
        const btnText = document.getElementById('loginBtnText');
        const spinner = document.getElementById('loginSpinner');
        
        // Validación básica
        if (!email || !password) {
            if (typeof showAlert === 'function') {
                showAlert('Por favor completa todos los campos', 'warning');
            } else {
                alert('Por favor completa todos los campos');
            }
            return;
        }
        
        // Validar email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            if (typeof showAlert === 'function') {
                showAlert('Por favor ingresa un email válido', 'warning');
            } else {
                alert('Por favor ingresa un email válido');
            }
            return;
        }
        
        // Mostrar loading
        submitBtn.disabled = true;
        if (btnText) btnText.textContent = 'Iniciando sesión...';
        if (spinner) spinner.classList.remove('d-none');
        
        try {
            console.log('Intentando login...');
            
            if (typeof login === 'function') {
                const result = await login(email, password);
                console.log('Resultado login:', result);
                
                if (result.success) {
                    // La redirección se maneja en la función login
                    if (typeof showAlert === 'function') {
                        showAlert('¡Inicio de sesión exitoso!', 'success');
                    }
                } else {
                    if (typeof showAlert === 'function') {
                        showAlert(result.error || 'Error al iniciar sesión', 'danger');
                    } else {
                        alert('Error: ' + (result.error || 'Error al iniciar sesión'));
                    }
                }
            } else {
                console.error('Función login no disponible');
                if (typeof showAlert === 'function') {
                    showAlert('Error de configuración del sistema', 'danger');
                } else {
                    alert('Error de configuración');
                }
            }
        } catch (error) {
            console.error('Error en login:', error);
            if (typeof showAlert === 'function') {
                showAlert('Error al procesar la solicitud', 'danger');
            } else {
                alert('Error al procesar la solicitud');
            }
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            if (btnText) btnText.textContent = 'Iniciar Sesión';
            if (spinner) spinner.classList.add('d-none');
        }
    });
    
    // Validación en tiempo real
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    
    if (emailInput) {
        emailInput.addEventListener('input', function() {
            const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value.trim());
            if (isValid) {
                this.classList.remove('is-invalid');
                this.classList.add('is-valid');
            } else {
                this.classList.remove('is-valid');
                this.classList.add('is-invalid');
            }
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const isValid = this.value.length >= 6;
            if (isValid) {
                this.classList.remove('is-invalid');
                this.classList.add('is-valid');
            } else {
                this.classList.remove('is-valid');
                this.classList.add('is-invalid');
            }
        });
    }
});