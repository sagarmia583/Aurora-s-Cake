# Aurora’s Cake production hosting

Production storefront and staff API run on [Netlify](https://aurorascake.netlify.app/) with the original Apps Script deployment and Google Sheet. GitHub holds the source and runs verification. The static Pages workflow verifies a read-only build without publishing it.

Verify `/api/backend-health` and the Apps Script release before publishing an updated storefront. Update the existing Apps Script web deployment in place using the generated `apps-script/Code.AllInOne.gs`, preserving Script Properties and the existing Sheet. Verify order, staff delivery and tracking in staging before production.
