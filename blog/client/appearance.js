// Browser bundle exposing the shared appearance rules to the admin page.
// The same module (lib/appearance.cjs) renders the published site, so the
// admin form and the built pages always agree on what is valid.
import appearance from '../lib/appearance.cjs';

window.MinxiAppearance = appearance;
