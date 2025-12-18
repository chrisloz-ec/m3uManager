// register.js - VERSIÓN SIMPLIFICADA
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== REGISTER.JS ===');
    
    const form = document.getElementById('registerForm');
    if (!form) {
        console.error('Formulario no encontrado');
        return;
    }
    
    // Redirigir si ya está autenticado
    if (typeof redirectIfAuthenticated === 'function') {
        redirectIfAuthenticated();
    }
    
    // Elementos del formulario
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = form.querySelector('button[type="submit"]');
    const btnText = document.getElementById('registerBtnText');
    const spinner = document.getElementById('registerSpinner');
    
    // Validación en tiempo real
    if (fullNameInput) {
        fullNameInput.addEventListener('input', function() {
            const isValid = this.value.trim().length >= 2;
            updateInputValidation(this, isValid);
        });
    }
    
    if (emailInput) {
        emailInput.addEventListener('input', function() {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValid = emailRegex.test(this.value.trim());
            updateInputValidation(this, isValid);
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const isValid = this.value.length >= 6;
            updateInputValidation(this, isValid);
            validatePasswordMatch();
            updatePasswordStrength(this.value);
        });
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', function() {
            validatePasswordMatch();
        });
    }
    
    // Envío del formulario
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('Formulario enviado');
        
        // Obtener valores
        const fullName = fullNameInput ? fullNameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
        const termsCheckbox = document.getElementById('terms');
        const isTermsAccepted = termsCheckbox ? termsCheckbox.checked : true;
        
        // Validaciones
        if (!fullName || !email || !password || !confirmPassword) {
            showAlert('Por favor completa todos los campos', 'warning');
            return;
        }
        
        if (password !== confirmPassword) {
            showAlert('Las contraseñas no coinciden', 'warning');
            return;
        }
        
        if (!isTermsAccepted) {
            showAlert('Debes aceptar los términos y condiciones', 'warning');
            return;
        }
        
        // Mostrar loading
        if (submitBtn) submitBtn.disabled = true;
        if (btnText) btnText.textContent = 'Creando cuenta...';
        if (spinner) spinner.classList.remove('d-none');
        
        try {
            console.log('Llamando a register()...');
            
            if (typeof register === 'function') {
                const result = await register(fullName, email, password);
                console.log('Resultado:', result);
                
                if (result.success) {
                    showAlert(result.message, 'success');
                    
                    // Redirigir a login después de 3 segundos
                    setTimeout(() => {
                        window.location.href = 'login.html?registered=true';
                    }, 3000);
                } else {
                    showAlert(result.error || 'Error al crear la cuenta', 'danger');
                }
            } else {
                showAlert('Error: Función de registro no disponible', 'danger');
            }
        } catch (error) {
            console.error('Error inesperado:', error);
            showAlert('Error al procesar la solicitud', 'danger');
        } finally {
            // Restaurar botón
            if (submitBtn) submitBtn.disabled = false;
            if (btnText) btnText.textContent = 'Crear Cuenta';
            if (spinner) spinner.classList.add('d-none');
        }
    });
    
    // Funciones auxiliares
    function updateInputValidation(input, isValid) {
        if (isValid) {
            input.classList.remove('is-invalid');
            input.classList.add('is-valid');
        } else {
            input.classList.remove('is-valid');
            input.classList.add('is-invalid');
        }
    }
    
    function validatePasswordMatch() {
        if (!passwordInput || !confirmPasswordInput) return false;
        
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const isValid = password === confirmPassword && password.length >= 6;
        
        updateInputValidation(confirmPasswordInput, isValid);
        return isValid;
    }
    
    function updatePasswordStrength(password) {
        const strengthBar = document.getElementById('passwordStrength');
        const strengthText = document.getElementById('passwordStrengthText');
        
        if (!strengthBar || !strengthText) return;
        
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
        
        strengthBar.style.width = `${strength}%`;
        strengthBar.className = `progress-bar bg-${color}`;
        strengthText.textContent = `Seguridad: ${text}`;
        strengthText.className = `text-${color}`;
    }
});