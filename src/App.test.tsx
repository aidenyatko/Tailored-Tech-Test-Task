import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("creates a data room and folder", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Data Room" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "New data room" }));
    await user.type(screen.getByLabelText("Name"), "Acme Deal");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("heading", { name: "Acme Deal" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Financials");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Financials")).toBeInTheDocument();
  });

  it("uploads duplicate PDFs with a safe generated name", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "New data room" }));
    await user.type(screen.getByLabelText("Name"), "Acme Deal");
    await user.click(screen.getByRole("button", { name: "Create" }));

    const input = await screen.findByTestId("pdf-upload");
    const firstFile = new File(["%PDF-1.4"], "Report.pdf", { type: "application/pdf" });
    const secondFile = new File(["%PDF-1.4"], "Report.pdf", { type: "application/pdf" });

    await user.upload(input, firstFile);
    await user.upload(input, secondFile);

    expect(await screen.findByText("Report.pdf")).toBeInTheDocument();
    expect(await screen.findByText("Report (1).pdf")).toBeInTheDocument();
  });

  it("deletes a folder from the current data room", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "New data room" }));
    await user.type(screen.getByLabelText("Name"), "Acme Deal");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Financials");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await user.click(await screen.findByRole("button", { name: "Delete Financials" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
    expect(screen.queryByText("Financials")).not.toBeInTheDocument();
  });
});
