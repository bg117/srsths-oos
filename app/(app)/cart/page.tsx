"use client";

import { useAuth } from "@/components/AuthContextProvider";
import CartItem from "@/components/CartItem";
import ExtraInstructionsCard from "@/components/ExtraInstructionsCard";
import { CartItem as CartItemType, Item } from "@/payload-types";
import { api } from "@/utilities/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, redirect } from "next/navigation";
import { PaginatedDocs } from "payload";
import { useCallback, useMemo, useState } from "react";
import { Row, Col, Card } from "react-bootstrap";
import qs from "qs";

export default function CartPage() {
  const { user, status: userStatus } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [instructions, setInstructions] = useState("");

  const {
    data,
    status: queryStatus,
    error,
  } = useQuery<PaginatedDocs<CartItemType>>({
    queryKey: ["cart-items"],
    queryFn: async () => {
      const response = await api("/cart-items", { method: "GET" });
      return response;
    },
  });

  // mutation to update quantity of cart item
  const { mutate: update } = useMutation({
    mutationKey: ["cart-items"],
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      const response = await api(`/cart-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
      return response;
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["cart-items"] });
    },
    onError: (error) => {
      throw error;
    },
  });

  // mutation to remove item from cart
  const { mutate: remove } = useMutation({
    mutationKey: ["cart-items"],
    mutationFn: async (id: number) => {
      const response = await api(`/cart-items/${id}`, {
        method: "DELETE",
      });
      return response;
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["cart-items"] });
    },
    onError: (error) => {
      throw error;
    },
  });

  // submit order to /api/orders
  const cartItems = data?.docs;
  const { mutate: submitOrder } = useMutation({
    mutationKey: ["orders"],
    mutationFn: async () => {
      // get all cart items
      if (!cartItems) return;

      const response = await api("/orders", {
        method: "POST",
        body: JSON.stringify({ instructions, user: user?.id }),
      });
      // get the order id
      const orderId = response.doc.id;

      // create order items
      const orderItems = cartItems.map((item) => ({
        order: orderId,
        item: (item.item as Item).id,
        quantity: item.quantity,
      }));

      // create order items
      for (const orderItem of orderItems) {
        await api("/order-items", {
          method: "POST",
          body: JSON.stringify(orderItem),
        });
      }

      const query = qs.stringify(
        {
          where: {
            user: {
              equals: user?.id,
            },
          },
        },
        { addQueryPrefix: false }
      );
      // clear cart of user
      await api(`/cart-items?${query}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      router.push("/thank-you");
      return queryClient.invalidateQueries({ queryKey: ["cart-items"] });
    },
    onError: (error) => {
      throw error;
    },
  });

  const calculateTotal = useMemo(() => {
    if (!cartItems)
      throw new Error("Cart items are not loaded yet. Please wait...");
    return cartItems
      .reduce(
        (total, item) => total + (item.item as Item).price * item.quantity,
        0
      )
      .toFixed(2);
  }, [cartItems]);

  const onChangeInstructions = useCallback((instructions: string) => {
    setInstructions(instructions);
  }, []);

  if (userStatus === "admin") return <div>Admins cannot order items</div>;
  if (userStatus === "logged-out") return redirect("/login");
  if (queryStatus === "pending" || userStatus === "loading")
    return <div>Loading...</div>;
  if (queryStatus === "error") throw error;

  if (cartItems?.length === 0 || !cartItems) {
    return <div>Your cart is empty</div>;
  }

  return (
    <div className="container">
      <h1>Cart</h1>
      <Row className="g-2 mt-1">
        <Col md={8}>
          <Card>
            <Card.Body>
              <Card.Title>Order Summary</Card.Title>
              <Card.Subtitle className="mb-3 text-muted">
                Review your order details
              </Card.Subtitle>
              <div>
                {cartItems.map((item, index) => (
                  <CartItem
                    key={index}
                    name={(item.item as Item).name}
                    quantity={item.quantity}
                    price={(item.item as Item).price}
                    onChangeQuantity={(quantity) => {
                      update({ id: item.id, quantity });
                    }}
                    onDelete={() => {
                      remove(item.id);
                    }}
                  />
                ))}
              </div>
              <hr />
              <div className="d-flex justify-content-between">
                <strong>Total:</strong>
                <strong>₱{calculateTotal}</strong>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <ExtraInstructionsCard
            instructions={instructions}
            onChangeInstructions={onChangeInstructions}
            onSubmit={submitOrder}
          />
        </Col>
      </Row>
    </div>
  );
}
