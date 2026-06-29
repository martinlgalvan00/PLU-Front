export default function PageTransition({ children, viewKey }) {
  return (
    <div key={viewKey} className="page-transition">
      {children}
    </div>
  )
}
