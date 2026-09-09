(function () {
  'use strict';

  const ACA = 'Seguro de Salud (ACA)';
  const BUSINESS = 'Seguro Grupal para Empresas (2-50 empleados)';
  const form = document.getElementById('lead-form');
  const service = document.getElementById('f-svc');
  const agent = document.getElementById('f-agent');
  const fields = document.getElementById('lead-fields');
  const businessFields = document.getElementById('business-fields');
  const consent = document.getElementById('f-consent');
  const submit = document.getElementById('lead-submit');
  const error = document.getElementById('f-error');
  const success = document.getElementById('form-ok');
  const acaPanel = document.getElementById('aca-panel');
  const acaLink = document.getElementById('aca-continue');
  const consentVersion = 'contacto-manual-2026-09-09-v1';
  let sending = false;
  let submitted = false;
  let source = 'formulario-principal';

  const routes = {
    aca: ACA,
    vida: 'Seguro de Vida',
    auto: 'Seguro de Auto',
    medicare: 'Medicare Advantage',
    suplementarios: 'Seguros Suplementarios (Cáncer, Accidentes, Enfermedades Críticas)',
    empresas: BUSINESS
  };

  function updateAgentLink() {
    // Use the established consent-first entrypoints; never attach personal data.
    acaLink.href = agent.value === 'Delbert Useches'
      ? 'https://www.enrollsalud.com/q/delbert'
      : 'https://www.enrollsalud.com/q/liliana-vera';
    document.getElementById('aca-agent-name').textContent = agent.value || 'Liliana Vera';
  }

  function updateService() {
    const isACA = service.value === ACA;
    const isBusiness = service.value === BUSINESS;
    const showContact = Boolean(service.value) && !isACA;
    fields.hidden = !showContact;
    fields.disabled = !showContact;
    businessFields.hidden = !isBusiness;
    businessFields.disabled = !isBusiness;
    acaPanel.hidden = !isACA;
    document.getElementById('agent-wrap').hidden = !service.value;
    document.getElementById('selection-help').hidden = Boolean(service.value);
    document.getElementById('f-consent-topic').textContent = service.value || 'la cobertura que seleccione';
    submit.textContent = isBusiness ? 'Solicitar asesoría para mi empresa →' : 'Solicitar que me llamen →';
    error.hidden = true;
    // A new product selection requires permission for that product again.
    consent.checked = false;
    if (isBusiness) agent.value = 'Delbert Useches';
    updateAgentLink();
  }

  function setBusy(busy) {
    sending = busy;
    form.setAttribute('aria-busy', String(busy));
    service.disabled = busy;
    agent.disabled = busy;
    fields.disabled = busy;
    submit.classList.toggle('loading', busy);
    submit.textContent = busy ? 'Enviando solicitud…'
      : service.value === BUSINESS ? 'Solicitar asesoría para mi empresa →' : 'Solicitar que me llamen →';
  }

  function validate() {
    const name = document.getElementById('f-nom');
    const phone = document.getElementById('f-tel');
    name.setCustomValidity(name.value.trim() ? '' : 'Escribe tu nombre.');
    const digits = phone.value.replace(/\D/g, '');
    phone.setCustomValidity(/^(?:1)?\d{10}$/.test(digits)
      ? '' : 'Escribe un teléfono de EE. UU. de 10 dígitos, con código de área.');
    const company = document.getElementById('f-company');
    company.setCustomValidity(service.value === BUSINESS && !company.value.trim()
      ? 'Escribe el nombre de tu empresa.' : '');
    const email = document.getElementById('f-email');
    if (email.value && !email.validity.valid) document.getElementById('optional-details').open = true;
    return form.reportValidity();
  }

  async function sendRequest(event) {
    event.preventDefault();
    if (sending || submitted) return;
    // ACA is handled only by its explicit link to the signed-consent flow.
    if (!service.value || service.value === ACA) {
      (service.value === ACA ? acaLink : service).focus();
      return;
    }
    if (!validate() || !consent.checked) return;

    const now = new Date();
    const isBusiness = service.value === BUSINESS;
    const message = [
      document.getElementById('f-msg').value.trim() || 'Sin mensaje adicional',
      '',
      'Estado: ' + document.getElementById('f-state').value,
      ...(isBusiness ? [
        'Empresa: ' + document.getElementById('f-company').value.trim(),
        'Número de empleados: ' + document.getElementById('f-employees').value
      ] : []),
      'Origen: ' + source,
      'Permiso de contacto: ' + consentVersion,
      'Fecha del permiso (UTC): ' + now.toISOString(),
      'Texto aceptado: ' + document.getElementById('contact-consent-text').textContent.replace(/\s+/g, ' ').trim(),
      'Solicitud de contacto únicamente. No es autorización ACA, inscripción ni Scope of Appointment de Medicare.'
    ].join('\n');

    // Preserve existing template variables so the configured email keeps working.
    const params = {
      cliente_nombre: document.getElementById('f-nom').value.trim(),
      cliente_telefono: document.getElementById('f-tel').value.trim(),
      cliente_email: document.getElementById('f-email').value.trim() || 'No proporcionado',
      cobertura: service.value,
      agente_preferido: agent.value || 'Sin preferencia',
      mensaje: message,
      fecha: now.toLocaleString('es-US', {
        timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short'
      })
    };

    setBusy(true);
    error.hidden = true;
    try {
      if (!window.emailjs || typeof window.emailjs.send !== 'function') throw new Error('mail-unavailable');
      const response = await window.emailjs.send(EJS_SERVICE_ID, EJS_TEMPLATE_ID, params);
      if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
        throw new Error('mail-not-accepted');
      }
      submitted = true;
      form.hidden = true;
      success.hidden = false;
      success.focus();
    } catch (_) {
      // Keep the request in the form so the visitor can retry; do not log personal data.
      error.hidden = false;
      error.focus();
    } finally {
      setBusy(false);
    }
  }

  service.addEventListener('change', updateService);
  agent.addEventListener('change', updateAgentLink);
  form.addEventListener('submit', sendRequest);
  form.addEventListener('input', function (event) {
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
  });

  document.querySelectorAll('[data-coverage]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (sending) return;
      service.value = routes[link.dataset.coverage] || '';
      source = link.dataset.source || 'coberturas';
      if (submitted) {
        form.reset();
        service.value = routes[link.dataset.coverage] || '';
        submitted = false;
        form.hidden = false;
        success.hidden = true;
      }
      updateService();
      service.focus({ preventScroll: true });
    });
  });

  window.addEventListener('scroll', function () {
    document.getElementById('navbar').style.boxShadow = window.scrollY > 20
      ? '0 4px 40px rgba(0,0,0,0.6)' : 'none';
  }, { passive: true });
  updateService();
})();
