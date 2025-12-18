// recover-password.js
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('recoverForm');
    const emailInput = document.getElementById('recoverEmail');
    const submitBtn = form.querySelector('button[type="submit"]');
    const btnText = document.getElementById('recoverBtnText');
    const spinner = document.getElementById('recoverSpinner');
    const initialStep = document.getElementById('initialStep');
    const successStep = document.getElementById('successStep');
    
    // Redirigir si ya está autenticado
    checkAuth().then(session => {
        if (session) {
            window.location.href = 'dashboard.html';
        }
    });
    
    // Validación en tiempo real
    emailInput.addEventListener('input', function() {
        validateEmail(this);
    });
    
    // Envío del formulario
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validateEmail(emailInput)) {
            showAlert('Por favor ingresa un correo electrónico válido', 'warning');
            return;
        }
        
        // Deshabilitar botón y mostrar spinner
        submitBtn.disabled = true;
        btnText.textContent = 'Enviando...';
        spinner.classList.remove('d-none');
        
        try {
            const result = await resetPassword(emailInput.value.trim());
            
            if (result.success) {
                // Mostrar paso de éxito
                initialStep.classList.add('d-none');
                successStep.classList.remove('d-none');
            } else {
                showAlert(result.error || 'Error al enviar el enlace de recuperación', 'danger');
            }
        } catch (error) {
            showAlert('Error al procesar la solicitud', 'danger');
            console.error('Recover password error:', error);
        } finally {
            // Restaurar botón
            submitBtn.disabled = false;
            btnText.textContent = 'Enviar Enlace';
            spinner.classList.add('d-none');
        }
    });
    
    function validateEmail(input) {
        const value = input.value.trim();
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        
        if (isValid) {
            input.classList.remove('is-invalid');
            input.classList.add('is-valid');
        } else {
            input.classList.remove('is-valid');
            input.classList.add('is-invalid');
        }
        
        return isValid;
    }
    
    function showAlert(message, type) {
        const alertContainer = document.getElementById('alertContainer');
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alertDiv);
        
        setTimeout(() => {
            if (alertDiv.parentElement) {
                alertDiv.remove();
            }
        }, 5000);
    }
});