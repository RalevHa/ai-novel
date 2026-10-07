// Who the Terms and the Privacy Policy speak for. Set these when building the site (see web/.env.example); until then the pages say so in dev.
export const LEGAL = {
  operator: (import.meta.env.VITE_OPERATOR_NAME as string | undefined)?.trim() || 'ผู้ดูแลเว็บไซต์ AI Novel',
  contactEmail: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || '',
  updated: '7 ตุลาคม 2569', // change this when the text changes
}
