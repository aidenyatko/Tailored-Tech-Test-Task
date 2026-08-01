import { FileArchive, FolderTree, ShieldCheck } from "lucide-react";

export function App() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-8">
        <header className="flex flex-col gap-4 border-b border-mist pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-accent">Acme Corp.</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink md:text-4xl">
              Data Room
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-steel">
              Securely organize diligence folders and PDF files in a polished browser workspace.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-steel">
            <div className="rounded border border-mist bg-white px-3 py-2">
              <FolderTree className="mb-2 h-4 w-4 text-accent" />
              Folders
            </div>
            <div className="rounded border border-mist bg-white px-3 py-2">
              <FileArchive className="mb-2 h-4 w-4 text-accent" />
              PDFs
            </div>
            <div className="rounded border border-mist bg-white px-3 py-2">
              <ShieldCheck className="mb-2 h-4 w-4 text-accent" />
              Local
            </div>
          </div>
        </header>
        <section className="grid flex-1 place-items-center rounded border border-dashed border-mist bg-white p-8 text-center shadow-panel">
          <div>
            <p className="text-lg font-semibold text-ink">Application shell is ready.</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-steel">
              Data room storage, nested folder CRUD, PDF upload, preview, and search are added in
              the next feature branches.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
