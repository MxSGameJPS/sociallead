import { MockProvider } from "./mock-provider.js";

/**
 * CRMProvider — Conselho Regional de Medicina.
 *
 * A consulta oficial do CRM costuma exigir validação manual (captcha),
 * portanto ainda não há integração automática. Enquanto isso, este provider
 * reutiliza o MockProvider, que não retorna dados enquanto não houver
 * integração real (nunca gera dados fictícios).
 *
 * Para implementar a integração real:
 *  - substituir o método `search` por uma requisição à fonte oficial autorizada;
 *  - respeitar termos de uso, limites de requisição e cache;
 *  - nunca burlar captcha ou bloqueios;
 *  - implementar `normalize` mapeando os campos da fonte para o formato padrão.
 */
export class CRMProvider extends MockProvider {
  constructor() {
    super("CRM");
  }

  // async search(filters) {
  //   // Integração real com fonte oficial do CRM.
  // }

  // normalize(rawItem) {
  //   return this.buildRecord({
  //     name: rawItem.nome,
  //     registration: rawItem.crm,
  //     council: "CRM",
  //     ...
  //   });
  // }
}