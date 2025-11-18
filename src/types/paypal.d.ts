declare module 'paypal-rest-sdk' {
  export interface PaymentLink {
    href: string;
    rel: string;
    method: string;
  }

  export interface Payment {
    id: string;
    intent: string;
    state: string;
    links: PaymentLink[];
  }

  export interface Sale {
    id: string;
    state: string;
    amount: {
      total: string;
      currency: string;
    };
  }

  export interface Refund {
    id: string;
    state: string;
  }

  export interface PaymentCreateOptions {
    intent: string;
    payer: {
      payment_method: string;
    };
    redirect_urls: {
      return_url: string;
      cancel_url: string;
    };
    transactions: Array<{
      amount: {
        total: string;
        currency: string;
      };
      description: string;
    }>;
  }

  export interface RefundRequest {
    amount: {
      total: string;
      currency: string;
    };
  }

  export namespace payment {
    function create(
      paymentData: PaymentCreateOptions,
      callback: (error: any, payment: Payment) => void
    ): void;
    function get(
      paymentId: string,
      callback: (error: any, payment: Payment) => void
    ): void;
  }

  export namespace sale {
    function refund(
      paymentId: string,
      refundData: RefundRequest,
      callback: (error: any, refund: Refund) => void
    ): void;
  }

  export function configure(options: {
    mode: string;
    client_id: string;
    client_secret: string;
  }): void;
}