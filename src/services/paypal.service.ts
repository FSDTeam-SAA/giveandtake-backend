import axios from 'axios'
import { paypalClient } from '../config/paypal'
import * as paypal from '@paypal/checkout-server-sdk'

export const createOrder = async (amount: string) => {
  const request = new paypal.orders.OrdersCreateRequest()
  request.prefer('return=representation')
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: amount,
        },
      },
    ],
  })

  const order = await paypalClient.execute(request)
  return order.result
}

export const captureOrder = async (orderId: string) => {
  const request = new paypal.orders.OrdersCaptureRequest(orderId)
  // request.requestBody({}) // Empty body for capture
  const capture = await paypalClient.execute(request)
  return capture.result
}

export const refundOrder = async (
  captureId: string,
  amount: number
) => {
  const request = new paypal.payments.CapturesRefundRequest(captureId);

  request.requestBody({
    amount: {
      value: amount.toFixed(2),
      currency_code: 'USD',
    },
    invoice_id: '',
    note_to_payer: '',
  });

  const refund = await paypalClient.execute(request);
  return refund.result;
};
