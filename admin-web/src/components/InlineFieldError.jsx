export default function InlineFieldError({ message }) {
  if (!message) return null
  return (
    <div className="invalid-feedback d-block" role="alert">
      {message}
    </div>
  )
}
